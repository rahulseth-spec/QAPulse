import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import nodemailer from 'nodemailer';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash } from 'crypto';
import rateLimit from 'express-rate-limit';
import User from './models/User.js';
import Role from './models/Role.js';
import AuditLog from './models/AuditLog.js';
import WeeklyReport from './models/WeeklyReport.js';
import Counter from './models/Counter.js';
import Project from './models/Project.js';
import ProjectMember from './models/ProjectMember.js';
import Requirement from './models/Requirement.js';
import Module from './models/Module.js';

const envPaths = [
  path.resolve(process.cwd(), '.env.local'),
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env.local'),
  path.resolve(process.cwd(), '..', '.env'),
];
for (const p of envPaths) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
  }
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_DB = process.env.MONGODB_DB || 'qapulse';
const JWT_SECRET = process.env.JWT_SECRET;
const DEV_MODE = String(process.env.DEV_MODE).toLowerCase() === 'true';

if (!MONGODB_URI || !JWT_SECRET) {
  console.error('Missing required environment variables: MONGODB_URI or JWT_SECRET');
  process.exit(1);
}

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGIN || process.env.CLIENT_ORIGIN || process.env.FRONTEND_ORIGIN || 'http://localhost:3000')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, Postman)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in 15 minutes.' },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests. Please try again in an hour.' },
});

let dbReady = false;
const memUsers = new Map();
const googleStates = new Map();
let googleCertCache = { certs: null, expiresAt: 0 };

// ─── Helpers ────────────────────────────────────────────────────────────────

function toBase64Url(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function getWebOriginFromReq(req) {
  const ref = req.get('referer');
  if (ref) {
    try {
      const u = new URL(ref);
      return `${u.protocol}//${u.host}`;
    } catch {}
  }
  const fromEnv = process.env.WEB_ORIGIN || process.env.CLIENT_ORIGIN || process.env.FRONTEND_ORIGIN;
  return fromEnv || 'http://localhost:3000';
}

function getApiOriginFromReq(req) {
  const proto = req.get('x-forwarded-proto') || req.protocol || 'http';
  return `${proto}://${req.get('host')}`;
}

function makeTokenHash(token) {
  return createHash('sha256').update(token).digest('hex');
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length === 0) return 'Password is required';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
  if (!/\d/.test(password)) return 'Password must contain at least one number';
  if (!/[!@#$%^&*()\-_=+[\]{}|;':",.<>?/`~\\]/.test(password)) {
    return 'Password must contain at least one special character';
  }
  return null;
}

// ─── Mail ────────────────────────────────────────────────────────────────────

let mailTransport = null;

function getMailTransport() {
  const host = process.env.SMTP_HOST;
  const portRaw = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.MAIL_FROM;

  if (!host || !user || !pass || !from) return null;

  const port = portRaw ? parseInt(portRaw, 10) : 587;
  const secure = String(process.env.SMTP_SECURE).toLowerCase() === 'true' || port === 465;

  if (!mailTransport) {
    mailTransport = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
  }
  return mailTransport;
}

async function sendResetPasswordEmail(toEmail, resetUrl) {
  const transport = getMailTransport();
  if (!transport) return false;
  const from = process.env.MAIL_FROM;
  await transport.sendMail({
    from,
    to: toEmail,
    subject: 'Reset your QAPulse password',
    text: `You requested a password reset for QAPulse.\n\nReset your password:\n${resetUrl}\n\nIf you did not request this, ignore this email.\n`,
    html: `<p>You requested a password reset for <b>QAPulse</b>.</p><p><a href="${resetUrl}">Reset your password</a></p><p>If you did not request this, ignore this email.</p>`,
  });
  return true;
}

// ─── Google OAuth ────────────────────────────────────────────────────────────

async function getGoogleCertForKid(kid) {
  const now = Date.now();
  if (!googleCertCache.certs || googleCertCache.expiresAt <= now) {
    const resp = await fetch('https://www.googleapis.com/oauth2/v1/certs');
    const certs = await resp.json();
    let maxAgeMs = 60 * 60 * 1000;
    const cacheControl = resp.headers.get('cache-control') || '';
    const match = cacheControl.match(/max-age=(\d+)/);
    if (match) {
      const seconds = parseInt(match[1], 10);
      if (!Number.isNaN(seconds)) maxAgeMs = seconds * 1000;
    }
    googleCertCache = { certs, expiresAt: now + maxAgeMs };
  }
  return googleCertCache.certs?.[kid];
}

function decodeJwtHeader(token) {
  const [head] = String(token).split('.');
  if (!head) return null;
  try {
    return JSON.parse(Buffer.from(head, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function verifyGoogleIdToken(idToken, clientId) {
  const header = decodeJwtHeader(idToken);
  const kid = header?.kid;
  if (!kid) throw new Error('Missing kid');
  const cert = await getGoogleCertForKid(kid);
  if (!cert) throw new Error('Unknown kid');
  return jwt.verify(idToken, cert, {
    algorithms: ['RS256'],
    audience: clientId,
    issuer: ['accounts.google.com', 'https://accounts.google.com'],
  });
}

// ─── Database ────────────────────────────────────────────────────────────────

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    await User.init();
    await Role.init();
    await AuditLog.init();
    await WeeklyReport.init();
    await Counter.init();
    await Project.init();
    await ProjectMember.init();
    await Requirement.init();
    await Module.init();
    dbReady = true;
    console.log('Connected to MongoDB and ensured indexes');
  } catch (err) {
    dbReady = false;
    console.error('MongoDB connection error:', err);
  }
}

function connectWithRetry() {
  connectDB().then(() => {
    if (!dbReady) setTimeout(connectWithRetry, 5000);
  });
}

// ─── Auth helpers ────────────────────────────────────────────────────────────

function signToken(userId, tokenVersion = 0) {
  return jwt.sign({ userId, tokenVersion }, JWT_SECRET, { expiresIn: '7d' });
}

const DEFAULT_PERMISSIONS_BY_ROLE = {
  reportee: {
    dashboard: { view: true, edit: false },
    weeklyReports: { view: true, edit: false },
    docs: { view: true, edit: false },
    userManagement: { view: false, edit: false },
  },
  qaOwner: {
    dashboard: { view: true, edit: false },
    weeklyReports: { view: true, edit: true },
    docs: { view: true, edit: false },
    userManagement: { view: false, edit: false },
  },
  manager: {
    dashboard: { view: true, edit: true },
    weeklyReports: { view: true, edit: true },
    docs: { view: true, edit: true },
    userManagement: { view: true, edit: true },
  },
};

function normalizeRole(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 'reportee';
  if (v === 'admin' || v === 'superadmin' || v === 'super_admin') return 'manager';
  if (v === 'manager') return 'manager';
  if (v === 'qaowner' || v === 'qa_owner' || v === 'qa owner') return 'qaOwner';
  if (v === 'reportee') return 'reportee';
  return 'reportee';
}

function normalizePermissions(raw, role) {
  const base = DEFAULT_PERMISSIONS_BY_ROLE[normalizeRole(role)] || DEFAULT_PERMISSIONS_BY_ROLE.reportee;
  const out = JSON.parse(JSON.stringify(base));
  if (!raw || typeof raw !== 'object') return out;
  if (raw.weeklyReport && !raw.weeklyReports) raw.weeklyReports = raw.weeklyReport;
  for (const [area, perms] of Object.entries(raw)) {
    if (!perms || typeof perms !== 'object') continue;
    if (!out[area]) out[area] = { view: false, edit: false };
    if (typeof perms.view === 'boolean') out[area].view = perms.view;
    if (typeof perms.edit === 'boolean') out[area].edit = perms.edit;
  }
  return out;
}

function getManagerEmails() {
  const raw = String(process.env.MANAGER_EMAILS || process.env.ADMIN_EMAILS || '').trim();
  if (!raw) return [];
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function isManagerUser(user) {
  if (!user) return false;
  if (normalizeRole(user.role) === 'manager') return true;
  const email = String(user.email || '').toLowerCase().trim();
  return email ? getManagerEmails().includes(email) : false;
}

function shouldBeManagerEmail(email) {
  return getManagerEmails().includes(String(email || '').toLowerCase().trim());
}

function can(user, area, action) {
  if (isManagerUser(user)) return true;
  const perms = user?._effectivePermissions || normalizePermissions(user?.permissions, user?.role);
  return Boolean(perms?.[area]?.[action]);
}

// requireAuth — validates JWT, checks account status and token version, loads authUser
async function requireAuth(req, res, next) {
  const auth = String(req.get('authorization') || '');
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const userId = payload?.userId;
    if (!userId) return res.status(401).json({ error: 'Invalid auth token' });
    req.userId = userId;

    if (dbReady) {
      const user = await User.findById(userId).lean();
      if (!user) return res.status(401).json({ error: 'Invalid auth token' });

      if (user.status && user.status !== 'active') {
        return res.status(401).json({ error: 'Account is not active' });
      }
      if (typeof user.token_version === 'number' && typeof payload.tokenVersion === 'number') {
        if (payload.tokenVersion !== user.token_version) {
          return res.status(401).json({ error: 'Session expired' });
        }
      }

      // Compute effective permissions — role_id overrides legacy for non-managers
      let effectivePermissions = normalizePermissions(user.permissions, user.role);
      if (user.role_id && !isManagerUser(user)) {
        try {
          const roleDoc = await Role.findById(user.role_id).lean();
          if (roleDoc && roleDoc.status === 'active') {
            for (const [module, level] of Object.entries(roleDoc.permissions || {})) {
              effectivePermissions[module] = {
                view: level === 'view' || level === 'edit',
                edit: level === 'edit',
              };
            }
            req.authUserRole = roleDoc;
          }
        } catch {}
      }

      req.authUser = { ...user, _effectivePermissions: effectivePermissions };
    }

    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid auth token' });
  }
}

// requireManager — must come after requireAuth
async function requireManager(req, res, next) {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const user = req.authUser || (dbReady ? await User.findById(req.userId).lean() : null);
    if (!user) return res.status(401).json({ error: 'Invalid auth user' });
    if (!isManagerUser(user)) return res.status(403).json({ error: 'Forbidden' });
    req.authUser = req.authUser || user;
    return next();
  } catch (err) {
    console.error('requireManager error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ─── Audit log ───────────────────────────────────────────────────────────────

async function writeAuditLog({ actorId, actorEmail, action, targetType, targetId, changes, metadata, ipAddress }) {
  try {
    await AuditLog.create({
      actor_id: actorId || null,
      actor_email: actorEmail || '',
      action,
      target_type: targetType,
      target_id: targetId,
      changes: changes || null,
      metadata: metadata || null,
      ip_address: ipAddress || '',
      timestamp: new Date(),
    });
  } catch (err) {
    console.error('Audit log write error:', err);
  }
}

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', dbReady, mongoState: mongoose.connection.readyState, devMode: DEV_MODE });
});

// ─── Reports ─────────────────────────────────────────────────────────────────

app.get('/api/reports', requireAuth, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const user = req.authUser || await User.findById(req.userId).lean();
    if (!user) return res.status(401).json({ error: 'Invalid auth user' });
    if (!can(user, 'weeklyReports', 'view')) return res.status(403).json({ error: 'Forbidden' });

    const userProjects = Array.isArray(user.projects) ? user.projects.filter(Boolean) : [];
    const projectFilter = userProjects.length ? { projectId: { $in: [...userProjects, ''] } } : null;
    const query = isManagerUser(user)
      ? {}
      : (projectFilter ? { $or: [{ createdBy: req.userId }, projectFilter] } : { createdBy: req.userId });

    const items = await WeeklyReport.find(query).sort({ updatedAt: -1 }).lean();
    const normalized = items.map(doc => {
      const { _id, __v, reportId, ...rest } = doc;
      return {
        id: reportId,
        createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
        updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
        ...rest,
      };
    });
    return res.json({ reports: normalized });
  } catch (err) {
    console.error('List reports error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/reports', requireAuth, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const user = req.authUser || await User.findById(req.userId).lean();
    if (!user) return res.status(401).json({ error: 'Invalid auth user' });
    if (!can(user, 'weeklyReports', 'edit')) return res.status(403).json({ error: 'Forbidden' });

    const report = req.body || {};
    const reportId = String(report.id || '').trim();
    if (!reportId) return res.status(400).json({ error: 'Report id is required' });

    const otherOwner = await WeeklyReport.findOne({ reportId, createdBy: { $ne: req.userId } }).lean();
    if (otherOwner && !isManagerUser(user)) return res.status(403).json({ error: 'You do not have access to modify this report' });

    const existing = await WeeklyReport.findOne({ reportId }).lean();
    const createdBy = existing?.createdBy || req.userId;
    const nextStatus = String(report.status || existing?.status || 'DRAFT');
    const publishedBy = nextStatus === 'PUBLISHED' ? (existing?.publishedBy || req.userId) : undefined;

    const next = {
      reportId,
      projectId: String(report.projectId || ''),
      title: String(report.title || ''),
      startDate: String(report.startDate || ''),
      endDate: String(report.endDate || ''),
      isoWeek: Number(report.isoWeek || 0),
      year: Number(report.year || 0),
      month: Number(report.month || 0),
      weekOfMonth: Number(report.weekOfMonth || 0),
      status: nextStatus,
      revisionOf: report.revisionOf ? String(report.revisionOf) : undefined,
      goals: Array.isArray(report.goals) ? report.goals : [],
      capacity: report.capacity || {},
      strength: report.strength || {},
      decisions: Array.isArray(report.decisions) ? report.decisions : [],
      sprintHealth: report.sprintHealth || {},
      uedHealth: report.uedHealth || {},
      bottlenecks: Array.isArray(report.bottlenecks) ? report.bottlenecks : [],
      threads: Array.isArray(report.threads) ? report.threads : [],
      createdBy,
      updatedBy: req.userId,
      publishedBy,
    };

    const saved = await WeeklyReport.findOneAndUpdate(
      { reportId, createdBy },
      { $set: next },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.json({ report: saved.toJSON() });
  } catch (err) {
    console.error('Save report error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── User Management ─────────────────────────────────────────────────────────

// Serialize a user document for API responses
function serializeUser(u) {
  const obj = typeof u.toObject === 'function' ? u.toObject() : u;
  const { _id, __v, passwordHash, googleId, resetPasswordTokenHash, resetPasswordExpiresAt, ...rest } = obj;
  return {
    id: (_id || obj.id || '').toString(),
    ...rest,
    role: normalizeRole(obj.role),
    permissions: normalizePermissions(obj.permissions, obj.role),
    status: obj.status || 'active',
  };
}

app.get('/api/users', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });

    const statusFilter = req.query.status;
    const query = statusFilter && ['active', 'suspended', 'archived'].includes(statusFilter)
      ? { status: statusFilter }
      : {};

    const users = await User.find(query).sort({ createdAt: -1 }).lean();

    // Batch-load role names
    const roleIds = [...new Set(users.filter(u => u.role_id).map(u => u.role_id.toString()))];
    const roles = roleIds.length > 0 ? await Role.find({ _id: { $in: roleIds } }).lean() : [];
    const roleMap = Object.fromEntries(roles.map(r => [r._id.toString(), r]));

    const normalized = users.map(u => {
      const { _id, __v, passwordHash, googleId, resetPasswordTokenHash, resetPasswordExpiresAt, ...rest } = u;
      const roleDoc = u.role_id ? roleMap[u.role_id.toString()] : null;
      return {
        id: _id.toString(),
        ...rest,
        role: normalizeRole(u.role),
        permissions: normalizePermissions(u.permissions, u.role),
        status: u.status || 'active',
        role_name: roleDoc?.name || null,
        role_id: u.role_id ? u.role_id.toString() : null,
      };
    });

    return res.json({ users: normalized });
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/users/:id', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const user = await User.findById(req.params.id).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    let role_name = null;
    if (user.role_id) {
      const roleDoc = await Role.findById(user.role_id).lean();
      role_name = roleDoc?.name || null;
    }

    const { _id, __v, passwordHash, googleId, resetPasswordTokenHash, resetPasswordExpiresAt, ...rest } = user;
    return res.json({
      user: {
        id: _id.toString(),
        ...rest,
        role: normalizeRole(user.role),
        status: user.status || 'active',
        role_id: user.role_id ? user.role_id.toString() : null,
        role_name,
      },
    });
  } catch (err) {
    console.error('Get user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Create user (Super Admin sets name, email, password, role)
app.post('/api/users', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });

    const { name, email, password, role_id } = req.body || {};
    const displayName = String(name || '').trim();
    const lower = String(email || '').toLowerCase().trim();
    const rawPassword = String(password || '');

    if (!displayName) return res.status(400).json({ error: 'Name is required' });
    if (!lower) return res.status(400).json({ error: 'Email is required' });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(lower)) return res.status(400).json({ error: 'Invalid email address' });

    const passwordError = validatePassword(rawPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });

    if (!role_id) return res.status(400).json({ error: 'Role is required' });

    const roleDoc = await Role.findById(role_id).lean();
    if (!roleDoc || roleDoc.status !== 'active') {
      return res.status(400).json({ error: 'Selected role is invalid or archived' });
    }

    const existing = await User.findOne({ email: lower }).lean();
    if (existing) return res.status(409).json({ error: 'A user with this email already exists' });

    const passwordHash = await bcrypt.hash(rawPassword, 12);

    const user = await User.create({
      name: displayName,
      email: lower,
      passwordHash,
      role_id: roleDoc._id,
      role: 'reportee',
      status: 'active',
      token_version: 0,
      created_by: req.userId,
    });

    await writeAuditLog({
      actorId: req.userId,
      actorEmail: req.authUser?.email || '',
      action: 'user.created',
      targetType: 'user',
      targetId: user._id,
      metadata: {
        snapshot: { name: user.name, email: user.email, role_id: roleDoc._id.toString(), role_name: roleDoc.name },
      },
      ipAddress: req.ip,
    });

    return res.status(201).json({
      user: { ...user.toJSON(), role_name: roleDoc.name, role_id: roleDoc._id.toString() },
    });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'A user with this email already exists' });
    console.error('Create user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Legacy invite endpoint — kept for backward compat
app.post('/api/users/invite', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });

    const { email, name, role, projects = [], permissions } = req.body || {};
    const lower = String(email || '').toLowerCase().trim();
    const displayName = String(name || '').trim();
    if (!lower) return res.status(400).json({ error: 'email is required' });
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(lower)) return res.status(400).json({ error: 'Invalid email address' });
    if (!displayName) return res.status(400).json({ error: 'name is required' });

    const existing = await User.findOne({ email: lower }).lean();
    if (existing) return res.status(409).json({ error: 'User already exists' });

    const normalizedRole = normalizeRole(role);
    const nextPermissions = normalizePermissions(permissions || {}, normalizedRole);

    const created = await User.create({
      name: displayName,
      email: lower,
      projects: Array.isArray(projects) ? projects.map(String).filter(Boolean) : [],
      role: normalizedRole,
      permissions: nextPermissions,
      status: 'active',
      token_version: 0,
    });

    const token = randomBytes(24).toString('hex');
    created.resetPasswordTokenHash = makeTokenHash(token);
    created.resetPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await created.save();

    const expose = String(process.env.EXPOSE_RESET_URL).toLowerCase() === 'true' || DEV_MODE;
    const url = `${getWebOriginFromReq(req)}/#/reset-password?token=${encodeURIComponent(token)}`;

    if (getMailTransport()) {
      try { await sendResetPasswordEmail(lower, url); } catch (err) { console.error('Invite email error:', err); }
    }

    const userJson = created.toJSON();
    return res.status(201).json({
      user: { ...userJson, role: normalizeRole(created.role), permissions: normalizePermissions(created.permissions, created.role) },
      ...(expose ? { resetUrl: url } : {}),
    });
  } catch (err) {
    console.error('Invite user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Edit user — name, email, password, role_id, legacy role/projects/permissions
app.patch('/api/users/:id', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status === 'archived') return res.status(400).json({ error: 'Cannot edit an archived user. Restore it first.' });

    const patch = req.body || {};
    const changes = {};

    if (typeof patch.name === 'string') {
      const trimmedName = patch.name.trim();
      if (!trimmedName) return res.status(400).json({ error: 'Name cannot be empty' });
      if (trimmedName !== user.name) {
        changes.name = { before: user.name, after: trimmedName };
        user.name = trimmedName;
      }
    }

    if (typeof patch.email === 'string') {
      const newEmail = patch.email.toLowerCase().trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(newEmail)) return res.status(400).json({ error: 'Invalid email address' });
      if (newEmail !== user.email) {
        const conflict = await User.findOne({ email: newEmail, _id: { $ne: user._id } }).lean();
        if (conflict) return res.status(409).json({ error: 'Email is already in use' });
        changes.email = { before: user.email, after: newEmail };
        user.email = newEmail;
      }
    }

    if (typeof patch.password === 'string' && patch.password.length > 0) {
      const passwordError = validatePassword(patch.password);
      if (passwordError) return res.status(400).json({ error: passwordError });
      user.passwordHash = await bcrypt.hash(patch.password, 12);
      user.token_version = (user.token_version || 0) + 1;
      changes.password_changed = { before: null, after: true };
    }

    if (patch.role_id !== undefined) {
      const newRoleId = String(patch.role_id || '').trim();
      if (newRoleId) {
        const roleDoc = await Role.findById(newRoleId).lean();
        if (!roleDoc || roleDoc.status !== 'active') return res.status(400).json({ error: 'Selected role is invalid or archived' });
        const oldRoleId = user.role_id?.toString() || null;
        if (oldRoleId !== newRoleId) {
          changes.role_id = { before: oldRoleId, after: newRoleId };
          user.role_id = roleDoc._id;
        }
      } else {
        user.role_id = null;
      }
    }

    // Legacy fields
    if (typeof patch.role === 'string') {
      const nr = normalizeRole(patch.role);
      if (nr !== user.role) { changes.role = { before: user.role, after: nr }; user.role = nr; }
    }
    if (Array.isArray(patch.projects)) {
      user.projects = patch.projects.map(String).filter(Boolean);
    }
    if (patch.permissions && typeof patch.permissions === 'object') {
      user.permissions = normalizePermissions(patch.permissions, user.role);
    }

    await user.save();

    if (Object.keys(changes).length > 0) {
      await writeAuditLog({
        actorId: req.userId,
        actorEmail: req.authUser?.email || '',
        action: 'user.updated',
        targetType: 'user',
        targetId: user._id,
        changes,
        ipAddress: req.ip,
      });
    }

    let role_name = null;
    if (user.role_id) {
      const rDoc = await Role.findById(user.role_id).lean();
      role_name = rDoc?.name || null;
    }

    return res.json({ user: { ...serializeUser(user), role_name, role_id: user.role_id?.toString() || null } });
  } catch (err) {
    console.error('Update user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users/:id/suspend', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'active') return res.status(400).json({ error: 'Only active users can be suspended' });
    if (user._id.toString() === req.userId) return res.status(400).json({ error: 'Cannot suspend your own account' });

    user.status = 'suspended';
    user.suspended_at = new Date();
    user.token_version = (user.token_version || 0) + 1;
    await user.save();

    await writeAuditLog({
      actorId: req.userId,
      actorEmail: req.authUser?.email || '',
      action: 'user.suspended',
      targetType: 'user',
      targetId: user._id,
      metadata: { reason: req.body?.reason || null },
      ipAddress: req.ip,
    });

    return res.json({ user: serializeUser(user) });
  } catch (err) {
    console.error('Suspend user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users/:id/reactivate', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'suspended') return res.status(400).json({ error: 'Only suspended users can be reactivated' });

    user.status = 'active';
    user.suspended_at = null;
    await user.save();

    await writeAuditLog({
      actorId: req.userId,
      actorEmail: req.authUser?.email || '',
      action: 'user.reactivated',
      targetType: 'user',
      targetId: user._id,
      ipAddress: req.ip,
    });

    return res.json({ user: serializeUser(user) });
  } catch (err) {
    console.error('Reactivate user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users/:id/archive', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status === 'archived') return res.status(400).json({ error: 'User is already archived' });
    if (user._id.toString() === req.userId) return res.status(400).json({ error: 'Cannot archive your own account' });

    user.status = 'archived';
    user.archived_at = new Date();
    user.token_version = (user.token_version || 0) + 1;
    await user.save();

    await writeAuditLog({
      actorId: req.userId,
      actorEmail: req.authUser?.email || '',
      action: 'user.archived',
      targetType: 'user',
      targetId: user._id,
      ipAddress: req.ip,
    });

    return res.json({ user: serializeUser(user) });
  } catch (err) {
    console.error('Archive user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users/:id/restore', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'archived') return res.status(400).json({ error: 'Only archived users can be restored' });

    if (user.role_id) {
      const roleDoc = await Role.findById(user.role_id).lean();
      if (roleDoc && roleDoc.status === 'archived') {
        return res.status(400).json({ error: "Cannot restore: the user's assigned role is archived. Edit the user's role first." });
      }
    }

    user.status = 'active';
    user.archived_at = null;
    user.suspended_at = null;
    await user.save();

    await writeAuditLog({
      actorId: req.userId,
      actorEmail: req.authUser?.email || '',
      action: 'user.restored',
      targetType: 'user',
      targetId: user._id,
      ipAddress: req.ip,
    });

    return res.json({ user: serializeUser(user) });
  } catch (err) {
    console.error('Restore user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Role Management ─────────────────────────────────────────────────────────

const VALID_MODULES = ['dashboard', 'userManagement', 'roleManagement'];
const VALID_LEVELS = ['view', 'edit', 'no_access'];

function normalizeRolePermissions(input) {
  const perms = { dashboard: 'no_access', userManagement: 'no_access', roleManagement: 'no_access' };
  if (input && typeof input === 'object') {
    for (const mod of VALID_MODULES) {
      if (input[mod] && VALID_LEVELS.includes(input[mod])) {
        perms[mod] = input[mod];
      }
    }
  }
  return perms;
}

app.get('/api/roles', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });

    const statusFilter = req.query.status;
    const query = statusFilter && ['active', 'archived'].includes(statusFilter) ? { status: statusFilter } : {};

    const roles = await Role.find(query).sort({ createdAt: -1 }).lean();

    const roleIds = roles.map(r => r._id);
    const counts = await User.aggregate([
      { $match: { role_id: { $in: roleIds }, status: { $ne: 'archived' } } },
      { $group: { _id: '$role_id', count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map(c => [c._id.toString(), c.count]));

    return res.json({
      roles: roles.map(r => ({ ...r, id: r._id.toString(), user_count: countMap[r._id.toString()] || 0 })),
    });
  } catch (err) {
    console.error('List roles error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/roles', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });

    const { name, description, permissions } = req.body || {};
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return res.status(400).json({ error: 'Role name is required' });

    const nameNormalized = trimmedName.toLowerCase();
    const conflict = await Role.findOne({ name_normalized: nameNormalized }).lean();
    if (conflict) return res.status(409).json({ error: 'A role with this name already exists (including archived roles)' });

    const role = await Role.create({
      name: trimmedName,
      name_normalized: nameNormalized,
      description: String(description || '').trim(),
      permissions: normalizeRolePermissions(permissions),
      created_by: req.userId,
    });

    await writeAuditLog({
      actorId: req.userId,
      actorEmail: req.authUser?.email || '',
      action: 'role.created',
      targetType: 'role',
      targetId: role._id,
      metadata: { snapshot: role.toJSON() },
      ipAddress: req.ip,
    });

    return res.status(201).json({ role: role.toJSON() });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'A role with this name already exists' });
    console.error('Create role error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/roles/:id', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const role = await Role.findById(req.params.id).lean();
    if (!role) return res.status(404).json({ error: 'Role not found' });
    return res.json({ role: { ...role, id: role._id.toString() } });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/roles/:id', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });

    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.status === 'archived') return res.status(400).json({ error: 'Cannot edit an archived role. Restore it first.' });

    const { name, description, permissions } = req.body || {};
    const changes = {};

    if (name !== undefined) {
      const trimmedName = String(name).trim();
      if (!trimmedName) return res.status(400).json({ error: 'Role name cannot be empty' });
      const nameNormalized = trimmedName.toLowerCase();
      if (nameNormalized !== role.name_normalized) {
        const conflict = await Role.findOne({ name_normalized: nameNormalized, _id: { $ne: role._id } }).lean();
        if (conflict) return res.status(409).json({ error: 'A role with this name already exists (including archived roles)' });
        changes.name = { before: role.name, after: trimmedName };
        role.name = trimmedName;
        role.name_normalized = nameNormalized;
      }
    }

    if (description !== undefined) {
      const d = String(description || '').trim();
      if (d !== role.description) { changes.description = { before: role.description, after: d }; role.description = d; }
    }

    if (permissions !== undefined) {
      const newPerms = normalizeRolePermissions(permissions);
      const oldPerms = role.permissions || {};
      if (JSON.stringify(newPerms) !== JSON.stringify(oldPerms)) {
        changes.permissions = { before: oldPerms, after: newPerms };
        role.permissions = newPerms;
      }
    }

    await role.save();

    if (Object.keys(changes).length > 0) {
      await writeAuditLog({
        actorId: req.userId,
        actorEmail: req.authUser?.email || '',
        action: 'role.updated',
        targetType: 'role',
        targetId: role._id,
        changes,
        ipAddress: req.ip,
      });
    }

    return res.json({ role: role.toJSON() });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'A role with this name already exists' });
    console.error('Update role error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/roles/:id/archive-preview', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const role = await Role.findById(req.params.id).lean();
    if (!role) return res.status(404).json({ error: 'Role not found' });

    const affected = await User.find(
      { role_id: role._id, status: { $ne: 'archived' } },
      'name email status'
    ).lean();

    return res.json({
      affected_users: affected.map(u => ({ id: u._id.toString(), name: u.name, email: u.email, status: u.status || 'active' })),
      count: affected.length,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/roles/:id/archive', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.status === 'archived') return res.status(400).json({ error: 'Role is already archived' });

    const affected = await User.find({ role_id: role._id, status: { $ne: 'archived' } }, '_id').lean();

    role.status = 'archived';
    role.archived_at = new Date();
    await role.save();

    await writeAuditLog({
      actorId: req.userId,
      actorEmail: req.authUser?.email || '',
      action: 'role.archived',
      targetType: 'role',
      targetId: role._id,
      metadata: { affected_user_ids: affected.map(u => u._id.toString()) },
      ipAddress: req.ip,
    });

    return res.json({ role: role.toJSON() });
  } catch (err) {
    console.error('Archive role error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/roles/:id/restore', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const role = await Role.findById(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role not found' });
    if (role.status === 'active') return res.status(400).json({ error: 'Role is already active' });

    role.status = 'active';
    role.archived_at = null;
    await role.save();

    await writeAuditLog({
      actorId: req.userId,
      actorEmail: req.authUser?.email || '',
      action: 'role.restored',
      targetType: 'role',
      targetId: role._id,
      ipAddress: req.ip,
    });

    return res.json({ role: role.toJSON() });
  } catch (err) {
    console.error('Restore role error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Auth endpoints ───────────────────────────────────────────────────────────

app.post('/api/auth/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body || {};
    const lower = String(email || '').toLowerCase().trim();
    if (!lower) return res.status(400).json({ error: 'email is required' });

    let resetUrl;
    const expose = String(process.env.EXPOSE_RESET_URL).toLowerCase() === 'true' || DEV_MODE;
    const canEmail = !!getMailTransport();
    if (!canEmail && !expose) return res.status(503).json({ error: 'Email service is not configured' });

    if (!dbReady && DEV_MODE) {
      const user = memUsers.get(lower);
      if (user) {
        const token = randomBytes(24).toString('hex');
        user.resetPasswordTokenHash = makeTokenHash(token);
        user.resetPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const url = `${getWebOriginFromReq(req)}/#/reset-password?token=${encodeURIComponent(token)}`;
        if (canEmail) { try { await sendResetPasswordEmail(lower, url); } catch {} }
        if (expose) resetUrl = url;
      }
      return res.json({ message: 'If an account exists for that email, a reset link has been sent.', ...(resetUrl ? { resetUrl } : {}) });
    }

    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });

    const user = await User.findOne({ email: lower });
    if (user && user.status === 'active') {
      const token = randomBytes(24).toString('hex');
      user.resetPasswordTokenHash = makeTokenHash(token);
      user.resetPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();
      const url = `${getWebOriginFromReq(req)}/#/reset-password?token=${encodeURIComponent(token)}`;
      if (canEmail) { try { await sendResetPasswordEmail(lower, url); } catch (err) { console.error('Reset email error:', err); } }
      if (expose) resetUrl = url;

      await writeAuditLog({
        actorId: user._id,
        actorEmail: user.email,
        action: 'user.password_reset_requested',
        targetType: 'user',
        targetId: user._id,
        ipAddress: req.ip,
      });
    }

    return res.json({ message: 'If an account exists for that email, a reset link has been sent.', ...(resetUrl ? { resetUrl } : {}) });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body || {};
    const rawToken = String(token || '').trim();
    const nextPassword = String(password || '');
    if (!rawToken || !nextPassword) return res.status(400).json({ error: 'token and password are required' });

    const passwordError = validatePassword(nextPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });

    if (!dbReady && DEV_MODE) {
      for (const [, user] of memUsers.entries()) {
        if (
          user.resetPasswordTokenHash === makeTokenHash(rawToken) &&
          user.resetPasswordExpiresAt &&
          Date.parse(user.resetPasswordExpiresAt) > Date.now()
        ) {
          user.passwordHash = await bcrypt.hash(nextPassword, 12);
          delete user.resetPasswordTokenHash;
          delete user.resetPasswordExpiresAt;
          return res.json({ message: 'Password updated' });
        }
      }
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });

    const user = await User.findOne({
      resetPasswordTokenHash: makeTokenHash(rawToken),
      resetPasswordExpiresAt: { $gt: new Date() },
    });
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });

    user.passwordHash = await bcrypt.hash(nextPassword, 12);
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpiresAt = undefined;
    user.token_version = (user.token_version || 0) + 1;
    await user.save();

    await writeAuditLog({
      actorId: user._id,
      actorEmail: user.email,
      action: 'user.password_reset_completed',
      targetType: 'user',
      targetId: user._id,
      ipAddress: req.ip,
    });

    return res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/signup', (_req, res) => {
  res.status(403).json({ error: 'Signup is disabled. Contact your administrator.' });
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password are required' });

    const lower = String(email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(lower)) return res.status(400).json({ error: 'Invalid email' });
    if (String(password).trim().length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    if (!dbReady && DEV_MODE) {
      const user = memUsers.get(lower);
      if (!user) return res.status(404).json({ error: 'Invalid email' });
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) return res.status(401).json({ error: 'Invalid password' });
      const role = shouldBeManagerEmail(user.email) ? 'manager' : normalizeRole(user.role);
      user.role = role;
      user.permissions = normalizePermissions(user.permissions, role);
      const token = signToken(user.id, user.token_version || 0);
      return res.json({ token, user });
    }

    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });

    const user = await User.findOne({ email: lower });
    if (!user) return res.status(404).json({ error: 'Invalid email' });
    if (!user.passwordHash) return res.status(401).json({ error: 'Invalid password' });

    // Status check before password verification to avoid timing attacks leaking info
    if (user.status === 'archived') return res.status(401).json({ error: 'Account not found' });
    if (user.status === 'suspended') return res.status(401).json({ error: 'Account is suspended. Contact your administrator.' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid password' });

    const role = shouldBeManagerEmail(user.email) ? 'manager' : normalizeRole(user.role);
    user.role = role;
    user.last_login_at = new Date();

    // Compute effective permissions for response (includes role_id-based perms)
    let effectivePermissions = normalizePermissions(user.permissions, role);
    let role_name = null;
    if (user.role_id && !isManagerUser(user)) {
      const roleDoc = await Role.findById(user.role_id).lean();
      if (roleDoc && roleDoc.status === 'active') {
        for (const [module, level] of Object.entries(roleDoc.permissions || {})) {
          effectivePermissions[module] = { view: level === 'view' || level === 'edit', edit: level === 'edit' };
        }
        role_name = roleDoc.name;
      }
    }
    user.permissions = effectivePermissions;
    await user.save();

    const token = signToken(user._id.toString(), user.token_version || 0);
    const userJson = user.toJSON();
    return res.json({
      token,
      user: {
        ...userJson,
        role,
        permissions: effectivePermissions,
        status: user.status || 'active',
        role_id: user.role_id ? user.role_id.toString() : null,
        role_name,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────

app.get('/api/auth/google/status', (_req, res) => {
  const missing = [];
  if (!process.env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  res.json({ enabled: missing.length === 0, missing });
});

app.get('/api/auth/google', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return res.status(500).send('Missing GOOGLE_CLIENT_ID');
  const webOrigin = getWebOriginFromReq(req);
  const state = randomBytes(16).toString('hex');
  googleStates.set(state, { webOrigin, expiresAt: Date.now() + 10 * 60 * 1000 });
  const redirectUri = `${getApiOriginFromReq(req)}/api/auth/google/callback`;
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    include_granted_scopes: 'true',
    prompt: 'select_account',
    state,
  });
  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get('/api/auth/google/callback', async (req, res) => {
  try {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return res.status(500).send('Missing Google OAuth credentials');

    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    if (!code || !state) return res.status(400).send('Missing code or state');

    const stateData = googleStates.get(state);
    googleStates.delete(state);
    if (!stateData || stateData.expiresAt <= Date.now()) return res.status(400).send('Invalid state');

    const redirectUri = `${getApiOriginFromReq(req)}/api/auth/google/callback`;
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    const tokenData = await tokenResp.json();
    if (!tokenResp.ok) return res.status(502).send('Google token exchange failed');

    const idToken = tokenData.id_token;
    if (!idToken) return res.status(502).send('Missing id_token');

    const payload = await verifyGoogleIdToken(idToken, clientId);
    const email = String(payload.email || '').toLowerCase().trim();
    const name = String(payload.name || '').trim() || 'User';
    const sub = String(payload.sub || '').trim();
    if (!email) return res.status(400).send('Google account missing email');

    if (!dbReady) return res.status(503).send('Database not ready');

    const existing = await User.findOne({ email });
    let userRecord;

    if (!existing) {
      if (!shouldBeManagerEmail(email)) {
        return res.redirect(`${stateData.webOrigin}/#/oauth-callback?error=${encodeURIComponent('Not invited. Contact your administrator.')}`);
      }
      userRecord = await User.create({ name, email, googleId: sub, projects: [], role: 'manager', status: 'active', token_version: 0 });
    } else {
      if (existing.status === 'archived') {
        return res.redirect(`${stateData.webOrigin}/#/oauth-callback?error=${encodeURIComponent('Account not found.')}`);
      }
      if (existing.status === 'suspended') {
        return res.redirect(`${stateData.webOrigin}/#/oauth-callback?error=${encodeURIComponent('Account is suspended. Contact your administrator.')}`);
      }
      existing.googleId = sub || existing.googleId;
      if (name) existing.name = name;
      const role = shouldBeManagerEmail(existing.email) ? 'manager' : normalizeRole(existing.role);
      existing.role = role;
      existing.last_login_at = new Date();
      await existing.save();
      userRecord = existing;
    }

    const token = signToken(userRecord._id.toString(), userRecord.token_version || 0);
    const userB64 = toBase64Url(JSON.stringify(userRecord.toJSON()));
    return res.redirect(`${stateData.webOrigin}/#/oauth-callback?token=${encodeURIComponent(token)}&user=${encodeURIComponent(userB64)}`);
  } catch (err) {
    console.error('Google callback error:', err);
    return res.status(500).send('OAuth error');
  }
});

// ─── Project Management Helpers ──────────────────────────────────────────────

async function nextSeq(counterId) {
  const result = await Counter.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after' }
  );
  return result.seq;
}

function formatProjectId(seq) {
  return seq <= 999 ? `PRJ-${String(seq).padStart(3, '0')}` : `PRJ-${seq}`;
}

function formatReqId(seq) {
  return seq <= 999 ? `REQ-${String(seq).padStart(3, '0')}` : `REQ-${seq}`;
}

// Allowed project status transitions
const PROJECT_TRANSITIONS = {
  draft: ['active'],
  active: ['on_hold', 'completed'],
  on_hold: ['active', 'completed'],
  completed: [],
};

// Allowed REQ status transitions
const REQ_TRANSITIONS = {
  draft: ['under_review'],
  under_review: ['approved', 'rejected'],
  rejected: ['draft'],
  approved: ['under_review'],
};

// Serialize a project document to JSON-safe object
function serializeProject(p) {
  const obj = typeof p.toObject === 'function' ? p.toObject() : p;
  const { _id, __v, ...rest } = obj;
  return { id: (_id || obj.id || '').toString(), ...rest };
}

function serializeReq(r) {
  const obj = typeof r.toObject === 'function' ? r.toObject() : r;
  const { _id, __v, ...rest } = obj;
  return { id: (_id || obj.id || '').toString(), ...rest };
}

function serializeModule(m) {
  const obj = typeof m.toObject === 'function' ? m.toObject() : m;
  const { _id, __v, ...rest } = obj;
  return { id: (_id || obj.id || '').toString(), ...rest };
}

// Check if caller has system-level projectManagement permission
function canManageProjects(user) {
  if (!user) return false;
  if (isManagerUser(user)) return true;
  return can(user, 'projectManagement', 'edit');
}

function canViewProjects(user) {
  if (!user) return false;
  if (isManagerUser(user)) return true;
  return can(user, 'projectManagement', 'view');
}

// Get active membership for a user in a project
async function getProjectMembership(projectId, userId) {
  return ProjectMember.findOne({ project_id: projectId, user_id: userId, status: 'active' }).lean();
}

// Middleware: caller must be an active project member OR have system projectManagement:view
async function requireProjectAccess(req, res, next) {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const user = req.authUser;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (canViewProjects(user)) return next();
    const projectId = req.params.projectId || req.params.id;
    const membership = await getProjectMembership(projectId, user._id);
    if (!membership) return res.status(403).json({ error: 'Not a project member' });
    req.projectMembership = membership;
    return next();
  } catch (err) {
    console.error('requireProjectAccess error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Middleware: caller must be project_manager or above OR have system projectManagement:edit
async function requireProjectWrite(req, res, next) {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const user = req.authUser;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (canManageProjects(user)) return next();
    const projectId = req.params.projectId || req.params.id;
    const membership = await getProjectMembership(projectId, user._id);
    if (!membership) return res.status(403).json({ error: 'Not a project member' });
    if (membership.project_role === 'tester') return res.status(403).json({ error: 'Insufficient project role' });
    req.projectMembership = membership;
    return next();
  } catch (err) {
    console.error('requireProjectWrite error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// Middleware: caller must be project_manager OR have system projectManagement:edit
async function requireProjectManager(req, res, next) {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const user = req.authUser;
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (canManageProjects(user)) return next();
    const projectId = req.params.projectId || req.params.id;
    const membership = await getProjectMembership(projectId, user._id);
    if (!membership) return res.status(403).json({ error: 'Not a project member' });
    if (membership.project_role !== 'project_manager') return res.status(403).json({ error: 'Project Manager role required' });
    req.projectMembership = membership;
    return next();
  } catch (err) {
    console.error('requireProjectManager error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function sendProjectNotification(toEmail, subject, text) {
  try {
    const transport = getMailTransport();
    if (!transport) return;
    const from = process.env.MAIL_FROM;
    await transport.sendMail({ from, to: toEmail, subject, text });
  } catch (err) {
    console.error('Project notification email error:', err);
  }
}

// Populate member records with user details
async function populateMembers(members) {
  const userIds = members.map(m => m.user_id);
  const users = await User.find({ _id: { $in: userIds } }).select('name email status').lean();
  const userMap = Object.fromEntries(users.map(u => [u._id.toString(), u]));
  return members.map(m => ({
    id: m._id.toString(),
    project_id: m.project_id.toString(),
    user_id: m.user_id.toString(),
    project_role: m.project_role,
    assigned_by: m.assigned_by?.toString() || null,
    assigned_at: m.assigned_at,
    status: m.status,
    removed_at: m.removed_at || null,
    user: userMap[m.user_id.toString()] ? {
      id: userMap[m.user_id.toString()]._id.toString(),
      name: userMap[m.user_id.toString()].name,
      email: userMap[m.user_id.toString()].email,
      status: userMap[m.user_id.toString()].status,
    } : null,
  }));
}

// ─── Project Endpoints ────────────────────────────────────────────────────────

// GET /api/projects — list projects
app.get('/api/projects', requireAuth, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const user = req.authUser;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page) || 20));
    const skip = (page - 1) * perPage;

    const archivedFilter = req.query.archived === 'true';
    const statusFilter = req.query.status;

    let baseQuery = { archived: archivedFilter };
    if (statusFilter && ['draft', 'active', 'on_hold', 'completed'].includes(statusFilter)) {
      baseQuery.status = statusFilter;
    }

    // Non-system users only see projects they're members of
    if (!canViewProjects(user)) {
      const memberships = await ProjectMember.find({ user_id: user._id, status: 'active' }).select('project_id').lean();
      const projectIds = memberships.map(m => m.project_id);
      if (!projectIds.length) return res.json({ projects: [], total: 0, page, per_page: perPage });
      baseQuery._id = { $in: projectIds };
    }

    const [projects, total] = await Promise.all([
      Project.find(baseQuery).sort({ createdAt: -1 }).skip(skip).limit(perPage).lean(),
      Project.countDocuments(baseQuery),
    ]);

    // Attach member count per project
    const projectIds = projects.map(p => p._id);
    const memberCounts = await ProjectMember.aggregate([
      { $match: { project_id: { $in: projectIds }, status: 'active' } },
      { $group: { _id: '$project_id', count: { $sum: 1 } } },
    ]);
    const memberCountMap = Object.fromEntries(memberCounts.map(m => [m._id.toString(), m.count]));

    const serialized = projects.map(p => ({
      ...serializeProject(p),
      member_count: memberCountMap[p._id.toString()] || 0,
    }));

    return res.json({ projects: serialized, total, page, per_page: perPage });
  } catch (err) {
    console.error('List projects error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects — create project
app.post('/api/projects', requireAuth, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const user = req.authUser;
    if (!canManageProjects(user)) return res.status(403).json({ error: 'Forbidden' });

    const { name, description, start_date, end_date, tags } = req.body || {};

    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Project name is required' });
    if (!description || !String(description).trim()) return res.status(400).json({ error: 'Description is required' });

    const trimmedName = String(name).trim();
    const nameNormalized = trimmedName.toLowerCase();

    // Unique name check (system-wide including archived)
    const nameExists = await Project.findOne({ name_normalized: nameNormalized }).lean();
    if (nameExists) return res.status(400).json({ error: 'Project name already exists' });

    // Date validation
    let parsedStart = start_date ? new Date(start_date) : null;
    let parsedEnd = end_date ? new Date(end_date) : null;
    if (parsedStart && isNaN(parsedStart.getTime())) return res.status(400).json({ error: 'Invalid start date' });
    if (parsedEnd && isNaN(parsedEnd.getTime())) return res.status(400).json({ error: 'Invalid end date' });
    if (parsedStart && parsedEnd && parsedEnd <= parsedStart) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }

    // Sanitize tags
    const cleanTags = Array.isArray(tags)
      ? [...new Set(tags.map(t => String(t).trim()).filter(Boolean).slice(0, 10))]
      : [];

    const seq = await nextSeq('project_seq');
    const project_id = formatProjectId(seq);

    const project = await Project.create({
      project_id,
      name: trimmedName,
      name_normalized: nameNormalized,
      description: String(description).trim(),
      start_date: parsedStart,
      end_date: parsedEnd,
      status: 'draft',
      tags: cleanTags,
      created_by: user._id,
    });

    // Auto-assign creator as project_manager
    await ProjectMember.create({
      project_id: project._id,
      user_id: user._id,
      project_role: 'project_manager',
      assigned_by: user._id,
      assigned_at: new Date(),
    });

    await writeAuditLog({
      actorId: user._id,
      actorEmail: user.email,
      action: 'project.created',
      targetType: 'project',
      targetId: project._id,
      changes: serializeProject(project),
      ipAddress: req.ip,
    });

    return res.status(201).json({ project: serializeProject(project) });
  } catch (err) {
    console.error('Create project error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:id — project detail
app.get('/api/projects/:id', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.id).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const memberDocs = await ProjectMember.find({ project_id: project._id, status: 'active' }).lean();
    const members = await populateMembers(memberDocs);

    return res.json({ project: serializeProject(project), members });
  } catch (err) {
    console.error('Get project error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/projects/:id — edit project
app.patch('/api/projects/:id', requireAuth, requireProjectManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.archived) return res.status(409).json({ error: 'Project is archived' });

    const user = req.authUser;
    const allowed = ['name', 'description', 'start_date', 'end_date', 'status', 'tags'];
    const before = {};
    const updates = {};

    for (const field of allowed) {
      if (req.body[field] === undefined) continue;
      before[field] = project[field];

      if (field === 'name') {
        const trimmed = String(req.body.name).trim();
        if (!trimmed) return res.status(400).json({ error: 'Project name is required' });
        const normalized = trimmed.toLowerCase();
        if (normalized !== project.name_normalized) {
          const clash = await Project.findOne({ name_normalized: normalized, _id: { $ne: project._id } }).lean();
          if (clash) return res.status(400).json({ error: 'Project name already exists' });
        }
        updates.name = trimmed;
        updates.name_normalized = normalized;
      } else if (field === 'description') {
        const trimmed = String(req.body.description).trim();
        if (!trimmed) return res.status(400).json({ error: 'Description is required' });
        updates.description = trimmed;
      } else if (field === 'start_date') {
        const d = req.body.start_date ? new Date(req.body.start_date) : null;
        if (d && isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid start date' });
        updates.start_date = d;
      } else if (field === 'end_date') {
        const d = req.body.end_date ? new Date(req.body.end_date) : null;
        if (d && isNaN(d.getTime())) return res.status(400).json({ error: 'Invalid end date' });
        updates.end_date = d;
      } else if (field === 'status') {
        const newStatus = String(req.body.status);
        const allowed_next = PROJECT_TRANSITIONS[project.status] || [];
        if (!allowed_next.includes(newStatus)) {
          return res.status(400).json({ error: `Invalid status transition: ${project.status} → ${newStatus}` });
        }
        updates.status = newStatus;
      } else if (field === 'tags') {
        updates.tags = Array.isArray(req.body.tags)
          ? [...new Set(req.body.tags.map(t => String(t).trim()).filter(Boolean).slice(0, 10))]
          : [];
      }
    }

    // Validate date coherence after updates
    const finalStart = updates.start_date !== undefined ? updates.start_date : project.start_date;
    const finalEnd = updates.end_date !== undefined ? updates.end_date : project.end_date;
    if (finalStart && finalEnd && finalEnd <= finalStart) {
      return res.status(400).json({ error: 'End date must be after start date' });
    }

    if (!Object.keys(updates).length) return res.json({ project: serializeProject(project) });

    updates.updated_by = user._id;
    Object.assign(project, updates);
    await project.save();

    const after = {};
    for (const k of Object.keys(before)) after[k] = project[k];

    if (updates.status) {
      await writeAuditLog({ actorId: user._id, actorEmail: user.email, action: 'project.status_changed', targetType: 'project', targetId: project._id, changes: { before: { status: before.status }, after: { status: updates.status } }, ipAddress: req.ip });
    }
    await writeAuditLog({ actorId: user._id, actorEmail: user.email, action: 'project.updated', targetType: 'project', targetId: project._id, changes: { before, after }, ipAddress: req.ip });

    return res.json({ project: serializeProject(project) });
  } catch (err) {
    console.error('Update project error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:id/archive-preview
app.get('/api/projects/:id/archive-preview', requireAuth, requireProjectManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.id).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const [req_count, module_count] = await Promise.all([
      Requirement.countDocuments({ project_id: project._id, archived: false }),
      Module.countDocuments({ project_id: project._id, archived: false }),
    ]);

    return res.json({ req_count, module_count, tc_count: project.tc_count || 0 });
  } catch (err) {
    console.error('Archive preview error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects/:id/archive
app.post('/api/projects/:id/archive', requireAuth, requireProjectManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.archived) return res.status(409).json({ error: 'Project is already archived' });

    const user = req.authUser;
    project.archived = true;
    project.archived_at = new Date();
    project.archived_by = user._id;
    await project.save();

    // Notify all active members
    const members = await ProjectMember.find({ project_id: project._id, status: 'active' }).lean();
    const userIds = members.map(m => m.user_id);
    const users = await User.find({ _id: { $in: userIds } }).select('email').lean();
    for (const u of users) {
      if (u._id.toString() !== user._id.toString()) {
        sendProjectNotification(u.email, `Project "${project.name}" has been archived`, `The project "${project.name}" (${project.project_id}) has been archived in QA Pulse.`);
      }
    }

    await writeAuditLog({ actorId: user._id, actorEmail: user.email, action: 'project.archived', targetType: 'project', targetId: project._id, changes: { archived: true }, ipAddress: req.ip });

    return res.json({ project: serializeProject(project) });
  } catch (err) {
    console.error('Archive project error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects/:id/restore
app.post('/api/projects/:id/restore', requireAuth, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const user = req.authUser;
    if (!canManageProjects(user)) return res.status(403).json({ error: 'Forbidden' });
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (!project.archived) return res.status(409).json({ error: 'Project is not archived' });

    project.archived = false;
    project.archived_at = null;
    project.archived_by = null;
    await project.save();

    await writeAuditLog({ actorId: user._id, actorEmail: user.email, action: 'project.restored', targetType: 'project', targetId: project._id, changes: { archived: false }, ipAddress: req.ip });

    return res.json({ project: serializeProject(project) });
  } catch (err) {
    console.error('Restore project error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:id/members
app.get('/api/projects/:id/members', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const memberDocs = await ProjectMember.find({ project_id: req.params.id, status: 'active' }).lean();
    const members = await populateMembers(memberDocs);
    return res.json({ members });
  } catch (err) {
    console.error('List members error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects/:id/members — add member
app.post('/api/projects/:id/members', requireAuth, requireProjectManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.id).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.archived) return res.status(409).json({ error: 'Project is archived' });

    const { user_id, project_role } = req.body || {};
    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    if (!['project_manager', 'qa_lead', 'tester'].includes(project_role)) {
      return res.status(400).json({ error: 'Invalid project_role' });
    }

    const targetUser = await User.findById(user_id).lean();
    if (!targetUser || targetUser.status !== 'active') return res.status(404).json({ error: 'Active user not found' });

    const existing = await ProjectMember.findOne({ project_id: req.params.id, user_id, status: 'active' }).lean();
    if (existing) return res.status(409).json({ error: 'User is already a project member' });

    const actor = req.authUser;
    const member = await ProjectMember.create({
      project_id: req.params.id,
      user_id,
      project_role,
      assigned_by: actor._id,
      assigned_at: new Date(),
    });

    const roleLabel = project_role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    sendProjectNotification(targetUser.email, `You've been added to "${project.name}"`, `You have been added to the project "${project.name}" (${project.project_id}) as ${roleLabel} in QA Pulse.`);

    await writeAuditLog({ actorId: actor._id, actorEmail: actor.email, action: 'project.member_added', targetType: 'project', targetId: project._id, changes: { user_id, project_role }, ipAddress: req.ip });

    const [populated] = await populateMembers([member.toObject()]);
    return res.status(201).json({ member: populated });
  } catch (err) {
    console.error('Add member error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/projects/:id/members/:userId — update member role
app.patch('/api/projects/:id/members/:userId', requireAuth, requireProjectManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.id).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.archived) return res.status(409).json({ error: 'Project is archived' });

    const { project_role } = req.body || {};
    if (!['project_manager', 'qa_lead', 'tester'].includes(project_role)) {
      return res.status(400).json({ error: 'Invalid project_role' });
    }

    const member = await ProjectMember.findOne({ project_id: req.params.id, user_id: req.params.userId, status: 'active' });
    if (!member) return res.status(404).json({ error: 'Member not found' });

    // Guard: cannot demote last project manager
    if (member.project_role === 'project_manager' && project_role !== 'project_manager') {
      const pmCount = await ProjectMember.countDocuments({ project_id: req.params.id, project_role: 'project_manager', status: 'active' });
      if (pmCount <= 1) return res.status(400).json({ error: 'Cannot change role of the only Project Manager' });
    }

    const actor = req.authUser;
    const before = { project_role: member.project_role };
    member.project_role = project_role;
    await member.save();

    const targetUser = await User.findById(req.params.userId).select('email name').lean();
    if (targetUser) {
      const roleLabel = project_role.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      sendProjectNotification(targetUser.email, `Your role in "${project.name}" has changed`, `Your role in "${project.name}" has been updated to ${roleLabel}.`);
    }

    await writeAuditLog({ actorId: actor._id, actorEmail: actor.email, action: 'project.member_role_changed', targetType: 'project', targetId: project._id, changes: { user_id: req.params.userId, before, after: { project_role } }, ipAddress: req.ip });

    const [populated] = await populateMembers([member.toObject()]);
    return res.json({ member: populated });
  } catch (err) {
    console.error('Update member role error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/projects/:id/members/:userId — remove member
app.delete('/api/projects/:id/members/:userId', requireAuth, requireProjectManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.id).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.archived) return res.status(409).json({ error: 'Project is archived' });

    const member = await ProjectMember.findOne({ project_id: req.params.id, user_id: req.params.userId, status: 'active' });
    if (!member) return res.status(404).json({ error: 'Member not found' });

    // Guard: cannot remove last project manager
    if (member.project_role === 'project_manager') {
      const pmCount = await ProjectMember.countDocuments({ project_id: req.params.id, project_role: 'project_manager', status: 'active' });
      if (pmCount <= 1) return res.status(400).json({ error: 'Cannot remove the only Project Manager' });
    }

    const actor = req.authUser;
    member.status = 'removed';
    member.removed_at = new Date();
    member.removed_by = actor._id;
    await member.save();

    const targetUser = await User.findById(req.params.userId).select('email').lean();
    if (targetUser) {
      sendProjectNotification(targetUser.email, `Removed from "${project.name}"`, `You have been removed from the project "${project.name}" in QA Pulse.`);
    }

    await writeAuditLog({ actorId: actor._id, actorEmail: actor.email, action: 'project.member_removed', targetType: 'project', targetId: project._id, changes: { user_id: req.params.userId, project_role: member.project_role }, ipAddress: req.ip });

    return res.json({ member: { id: member._id.toString(), status: 'removed' } });
  } catch (err) {
    console.error('Remove member error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Requirement Endpoints ────────────────────────────────────────────────────

// GET /api/projects/:projectId/requirements
app.get('/api/projects/:projectId/requirements', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.projectId).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page) || 50));
    const skip = (page - 1) * perPage;

    const query = { project_id: req.params.projectId };
    if (req.query.archived === 'true') query.archived = true;
    else query.archived = false;
    if (req.query.status && ['draft', 'under_review', 'approved', 'rejected'].includes(req.query.status)) {
      query.status = req.query.status;
    }
    if (req.query.priority && ['high', 'medium', 'low'].includes(req.query.priority)) {
      query.priority = req.query.priority;
    }
    if (req.query.type && ['functional', 'non_functional', 'ui', 'performance'].includes(req.query.type)) {
      query.type = req.query.type;
    }

    const [requirements, total] = await Promise.all([
      Requirement.find(query).sort({ req_seq: 1 }).skip(skip).limit(perPage).lean(),
      Requirement.countDocuments(query),
    ]);

    return res.json({ requirements: requirements.map(serializeReq), total, page, per_page: perPage });
  } catch (err) {
    console.error('List requirements error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects/:projectId/requirements
app.post('/api/projects/:projectId/requirements', requireAuth, requireProjectWrite, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.archived) return res.status(409).json({ error: 'Project is archived' });

    const { title, description, type, priority } = req.body || {};
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Title is required' });
    if (!description || !String(description).trim()) return res.status(400).json({ error: 'Description is required' });
    if (!['functional', 'non_functional', 'ui', 'performance'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
    if (!['high', 'medium', 'low'].includes(priority)) return res.status(400).json({ error: 'Invalid priority' });

    const user = req.authUser;
    const seq = await nextSeq(`req_seq_${project._id}`);
    const req_id = formatReqId(seq);

    const requirement = await Requirement.create({
      req_id,
      req_seq: seq,
      project_id: project._id,
      title: String(title).trim(),
      description: String(description).trim(),
      type,
      priority,
      status: 'draft',
      created_by: user._id,
    });

    // Increment project req_count
    await Project.findByIdAndUpdate(project._id, { $inc: { req_count: 1 } });

    await writeAuditLog({ actorId: user._id, actorEmail: user.email, action: 'requirement.created', targetType: 'requirement', targetId: requirement._id, changes: serializeReq(requirement), ipAddress: req.ip });

    return res.status(201).json({ requirement: serializeReq(requirement) });
  } catch (err) {
    console.error('Create requirement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:projectId/requirements/:reqId
app.get('/api/projects/:projectId/requirements/:reqId', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const requirement = await Requirement.findOne({ _id: req.params.reqId, project_id: req.params.projectId }).lean();
    if (!requirement) return res.status(404).json({ error: 'Requirement not found' });
    return res.json({ requirement: serializeReq(requirement) });
  } catch (err) {
    console.error('Get requirement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/projects/:projectId/requirements/:reqId
app.patch('/api/projects/:projectId/requirements/:reqId', requireAuth, requireProjectWrite, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.projectId).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.archived) return res.status(409).json({ error: 'Project is archived' });

    const requirement = await Requirement.findOne({ _id: req.params.reqId, project_id: req.params.projectId });
    if (!requirement) return res.status(404).json({ error: 'Requirement not found' });
    if (requirement.archived) return res.status(409).json({ error: 'Requirement is archived' });

    const user = req.authUser;
    const allowed = ['title', 'description', 'type', 'priority', 'status'];
    const before = {};
    const updates = {};

    for (const field of allowed) {
      if (req.body[field] === undefined) continue;
      before[field] = requirement[field];

      if (field === 'title') {
        const t = String(req.body.title).trim();
        if (!t) return res.status(400).json({ error: 'Title is required' });
        updates.title = t;
      } else if (field === 'description') {
        const d = String(req.body.description).trim();
        if (!d) return res.status(400).json({ error: 'Description is required' });
        updates.description = d;
      } else if (field === 'type') {
        if (!['functional', 'non_functional', 'ui', 'performance'].includes(req.body.type)) return res.status(400).json({ error: 'Invalid type' });
        updates.type = req.body.type;
      } else if (field === 'priority') {
        if (!['high', 'medium', 'low'].includes(req.body.priority)) return res.status(400).json({ error: 'Invalid priority' });
        updates.priority = req.body.priority;
      } else if (field === 'status') {
        const newStatus = String(req.body.status);
        const allowedNext = REQ_TRANSITIONS[requirement.status] || [];
        if (!allowedNext.includes(newStatus)) {
          return res.status(400).json({ error: `Invalid status transition: ${requirement.status} → ${newStatus}` });
        }
        updates.status = newStatus;
      }
    }

    if (!Object.keys(updates).length) return res.json({ requirement: serializeReq(requirement) });

    updates.updated_by = user._id;
    Object.assign(requirement, updates);
    await requirement.save();

    if (updates.status) {
      await writeAuditLog({ actorId: user._id, actorEmail: user.email, action: 'requirement.status_changed', targetType: 'requirement', targetId: requirement._id, changes: { before: { status: before.status }, after: { status: updates.status } }, ipAddress: req.ip });

      // Notify QA Leads + PMs when REQ approved or rejected
      if (updates.status === 'approved' || updates.status === 'rejected') {
        const members = await ProjectMember.find({ project_id: project._id, project_role: updates.status === 'approved' ? { $in: ['qa_lead', 'project_manager'] } : 'project_manager', status: 'active' }).lean();
        const notifyIds = members.map(m => m.user_id);
        const notifyUsers = await User.find({ _id: { $in: notifyIds } }).select('email').lean();
        const action_label = updates.status === 'approved' ? 'approved' : 'rejected';
        for (const u of notifyUsers) {
          sendProjectNotification(u.email, `REQ ${requirement.req_id} "${requirement.title}" has been ${action_label}`, `Requirement ${requirement.req_id} in project "${project.name}" has been ${action_label}.`);
        }
      }
    }

    await writeAuditLog({ actorId: user._id, actorEmail: user.email, action: 'requirement.updated', targetType: 'requirement', targetId: requirement._id, changes: { before, after: updates }, ipAddress: req.ip });

    return res.json({ requirement: serializeReq(requirement) });
  } catch (err) {
    console.error('Update requirement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:projectId/requirements/:reqId/archive-preview
app.get('/api/projects/:projectId/requirements/:reqId/archive-preview', requireAuth, requireProjectWrite, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const requirement = await Requirement.findOne({ _id: req.params.reqId, project_id: req.params.projectId }).lean();
    if (!requirement) return res.status(404).json({ error: 'Requirement not found' });
    return res.json({ tc_count: requirement.coverage || 0 });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects/:projectId/requirements/:reqId/archive
app.post('/api/projects/:projectId/requirements/:reqId/archive', requireAuth, requireProjectWrite, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.projectId).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.archived) return res.status(409).json({ error: 'Project is archived' });

    const requirement = await Requirement.findOne({ _id: req.params.reqId, project_id: req.params.projectId });
    if (!requirement) return res.status(404).json({ error: 'Requirement not found' });
    if (requirement.archived) return res.status(409).json({ error: 'Requirement is already archived' });

    const user = req.authUser;
    requirement.archived = true;
    requirement.archived_at = new Date();
    requirement.archived_by = user._id;
    await requirement.save();

    await writeAuditLog({ actorId: user._id, actorEmail: user.email, action: 'requirement.archived', targetType: 'requirement', targetId: requirement._id, changes: { archived: true }, ipAddress: req.ip });

    return res.json({ requirement: serializeReq(requirement) });
  } catch (err) {
    console.error('Archive requirement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects/:projectId/requirements/:reqId/restore
app.post('/api/projects/:projectId/requirements/:reqId/restore', requireAuth, requireProjectWrite, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.projectId).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.archived) return res.status(409).json({ error: 'Project is archived' });

    const requirement = await Requirement.findOne({ _id: req.params.reqId, project_id: req.params.projectId });
    if (!requirement) return res.status(404).json({ error: 'Requirement not found' });
    if (!requirement.archived) return res.status(409).json({ error: 'Requirement is not archived' });

    const user = req.authUser;
    requirement.archived = false;
    requirement.archived_at = null;
    requirement.archived_by = null;
    await requirement.save();

    await writeAuditLog({ actorId: user._id, actorEmail: user.email, action: 'requirement.restored', targetType: 'requirement', targetId: requirement._id, changes: { archived: false }, ipAddress: req.ip });

    return res.json({ requirement: serializeReq(requirement) });
  } catch (err) {
    console.error('Restore requirement error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Module Endpoints ─────────────────────────────────────────────────────────

// GET /api/projects/:projectId/modules/approved-reqs — approved REQ picker
app.get('/api/projects/:projectId/modules/approved-reqs', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const reqs = await Requirement.find({ project_id: req.params.projectId, status: 'approved', archived: false }).sort({ req_seq: 1 }).lean();
    return res.json({ requirements: reqs.map(serializeReq) });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:projectId/modules
app.get('/api/projects/:projectId/modules', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.projectId).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(req.query.per_page) || 50));
    const skip = (page - 1) * perPage;

    const archivedFilter = req.query.archived === 'true';
    const rootQuery = { project_id: req.params.projectId, depth: 0, archived: archivedFilter };

    const [rootModules, total] = await Promise.all([
      Module.find(rootQuery).sort({ createdAt: 1 }).skip(skip).limit(perPage).lean(),
      Module.countDocuments(rootQuery),
    ]);

    // Fetch sub-modules for all root modules in one query
    const rootIds = rootModules.map(m => m._id);
    const subModules = rootIds.length
      ? await Module.find({ parent_module_id: { $in: rootIds }, archived: archivedFilter }).sort({ createdAt: 1 }).lean()
      : [];

    const subByParent = {};
    for (const sub of subModules) {
      const pid = sub.parent_module_id.toString();
      if (!subByParent[pid]) subByParent[pid] = [];
      subByParent[pid].push(serializeModule(sub));
    }

    const modules = rootModules.map(m => ({
      ...serializeModule(m),
      sub_modules: subByParent[m._id.toString()] || [],
    }));

    return res.json({ modules, total, page, per_page: perPage });
  } catch (err) {
    console.error('List modules error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects/:projectId/modules
app.post('/api/projects/:projectId/modules', requireAuth, requireProjectWrite, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.archived) return res.status(409).json({ error: 'Project is archived' });

    const { name, description, linked_req_ids, parent_module_id } = req.body || {};

    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Module name is required' });
    if (!Array.isArray(linked_req_ids) || linked_req_ids.length === 0) return res.status(400).json({ error: 'At least one requirement must be linked' });

    const trimmedName = String(name).trim();
    const nameNormalized = trimmedName.toLowerCase();

    // Name uniqueness within project (non-archived)
    const nameExists = await Module.findOne({ project_id: req.params.projectId, name_normalized: nameNormalized, archived: false }).lean();
    if (nameExists) return res.status(400).json({ error: 'Module name already exists in this project' });

    // Validate linked REQs
    const reqs = await Requirement.find({ _id: { $in: linked_req_ids }, project_id: req.params.projectId }).lean();
    if (reqs.length !== linked_req_ids.length) return res.status(400).json({ error: 'One or more requirements not found in this project' });
    const hasArchived = reqs.some(r => r.archived);
    if (hasArchived) return res.status(400).json({ error: 'Cannot link to an archived requirement' });
    const hasApproved = reqs.some(r => r.status === 'approved');
    if (!hasApproved) return res.status(400).json({ error: 'At least one linked requirement must be Approved' });

    // Validate parent module
    let depth = 0;
    if (parent_module_id) {
      const parentModule = await Module.findOne({ _id: parent_module_id, project_id: req.params.projectId }).lean();
      if (!parentModule) return res.status(400).json({ error: 'Parent module not found in this project' });
      if (parentModule.archived) return res.status(400).json({ error: 'Cannot nest under an archived module' });
      if (parentModule.depth >= 1) return res.status(400).json({ error: 'Maximum module depth exceeded (2 levels only)' });
      depth = parentModule.depth + 1;
    }

    const user = req.authUser;
    const module = await Module.create({
      project_id: project._id,
      name: trimmedName,
      name_normalized: nameNormalized,
      description: description ? String(description).trim() : '',
      linked_req_ids: reqs.map(r => r._id),
      parent_module_id: parent_module_id || null,
      depth,
      created_by: user._id,
    });

    await Project.findByIdAndUpdate(project._id, { $inc: { module_count: 1 } });

    // Notify QA Leads + PMs
    const members = await ProjectMember.find({ project_id: project._id, project_role: { $in: ['qa_lead', 'project_manager'] }, status: 'active' }).lean();
    const notifyIds = members.map(m => m.user_id).filter(id => id.toString() !== user._id.toString());
    const notifyUsers = await User.find({ _id: { $in: notifyIds } }).select('email').lean();
    for (const u of notifyUsers) {
      sendProjectNotification(u.email, `New module "${trimmedName}" created in "${project.name}"`, `A new module "${trimmedName}" has been created in project "${project.name}".`);
    }

    await writeAuditLog({ actorId: user._id, actorEmail: user.email, action: 'module.created', targetType: 'module', targetId: module._id, changes: serializeModule(module), ipAddress: req.ip });

    return res.status(201).json({ module: serializeModule(module) });
  } catch (err) {
    console.error('Create module error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:projectId/modules/:moduleId
app.get('/api/projects/:projectId/modules/:moduleId', requireAuth, requireProjectAccess, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const module = await Module.findOne({ _id: req.params.moduleId, project_id: req.params.projectId }).lean();
    if (!module) return res.status(404).json({ error: 'Module not found' });

    const [subModules, linkedReqs] = await Promise.all([
      Module.find({ parent_module_id: module._id, archived: false }).lean(),
      Requirement.find({ _id: { $in: module.linked_req_ids } }).select('req_id title status archived').lean(),
    ]);

    return res.json({
      module: serializeModule(module),
      sub_modules: subModules.map(serializeModule),
      linked_reqs: linkedReqs.map(serializeReq),
    });
  } catch (err) {
    console.error('Get module error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/projects/:projectId/modules/:moduleId
app.patch('/api/projects/:projectId/modules/:moduleId', requireAuth, requireProjectWrite, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.projectId).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.archived) return res.status(409).json({ error: 'Project is archived' });

    const module = await Module.findOne({ _id: req.params.moduleId, project_id: req.params.projectId });
    if (!module) return res.status(404).json({ error: 'Module not found' });
    if (module.archived) return res.status(409).json({ error: 'Module is archived' });

    const user = req.authUser;
    const before = {};
    const updates = {};

    if (req.body.name !== undefined) {
      const trimmed = String(req.body.name).trim();
      if (!trimmed) return res.status(400).json({ error: 'Module name is required' });
      const normalized = trimmed.toLowerCase();
      if (normalized !== module.name_normalized) {
        const clash = await Module.findOne({ project_id: req.params.projectId, name_normalized: normalized, archived: false, _id: { $ne: module._id } }).lean();
        if (clash) return res.status(400).json({ error: 'Module name already exists in this project' });
      }
      before.name = module.name;
      updates.name = trimmed;
      updates.name_normalized = normalized;
    }

    if (req.body.description !== undefined) {
      before.description = module.description;
      updates.description = String(req.body.description).trim();
    }

    if (req.body.linked_req_ids !== undefined) {
      const incoming = req.body.linked_req_ids;
      if (!Array.isArray(incoming) || incoming.length === 0) return res.status(400).json({ error: 'At least one requirement must be linked' });
      const reqs = await Requirement.find({ _id: { $in: incoming }, project_id: req.params.projectId }).lean();
      if (reqs.length !== incoming.length) return res.status(400).json({ error: 'One or more requirements not found in this project' });
      if (reqs.some(r => r.archived)) return res.status(400).json({ error: 'Cannot link to an archived requirement' });
      if (!reqs.some(r => r.status === 'approved')) return res.status(400).json({ error: 'At least one linked requirement must be Approved' });
      before.linked_req_ids = module.linked_req_ids;
      updates.linked_req_ids = reqs.map(r => r._id);
    }

    if (!Object.keys(updates).length) return res.json({ module: serializeModule(module) });

    updates.updated_by = user._id;
    Object.assign(module, updates);
    await module.save();

    if (updates.linked_req_ids) {
      await writeAuditLog({ actorId: user._id, actorEmail: user.email, action: 'module.linked_reqs_changed', targetType: 'module', targetId: module._id, changes: { before: before.linked_req_ids, after: updates.linked_req_ids }, ipAddress: req.ip });
    }
    await writeAuditLog({ actorId: user._id, actorEmail: user.email, action: 'module.updated', targetType: 'module', targetId: module._id, changes: { before, after: updates }, ipAddress: req.ip });

    return res.json({ module: serializeModule(module) });
  } catch (err) {
    console.error('Update module error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:projectId/modules/:moduleId/archive-preview
app.get('/api/projects/:projectId/modules/:moduleId/archive-preview', requireAuth, requireProjectWrite, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const module = await Module.findOne({ _id: req.params.moduleId, project_id: req.params.projectId }).lean();
    if (!module) return res.status(404).json({ error: 'Module not found' });

    const sub_module_count = await Module.countDocuments({ parent_module_id: module._id, archived: false });
    const tc_count = (module.tc_count?.total || 0);

    return res.json({ tc_count, sub_module_count });
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects/:projectId/modules/:moduleId/archive
app.post('/api/projects/:projectId/modules/:moduleId/archive', requireAuth, requireProjectWrite, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.projectId).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.archived) return res.status(409).json({ error: 'Project is archived' });

    const module = await Module.findOne({ _id: req.params.moduleId, project_id: req.params.projectId });
    if (!module) return res.status(404).json({ error: 'Module not found' });
    if (module.archived) return res.status(409).json({ error: 'Module is already archived' });

    const user = req.authUser;
    const now = new Date();
    module.archived = true;
    module.archived_at = now;
    module.archived_by = user._id;
    await module.save();

    // Cascade archive sub-modules
    const subModules = await Module.find({ parent_module_id: module._id, archived: false });
    for (const sub of subModules) {
      sub.archived = true;
      sub.archived_at = now;
      sub.archived_by = user._id;
      await sub.save();
      await writeAuditLog({ actorId: user._id, actorEmail: user.email, action: 'module.archived', targetType: 'module', targetId: sub._id, changes: { archived: true, cascade: true }, ipAddress: req.ip });
    }

    // Notify project managers
    if (subModules.length > 0) {
      const pms = await ProjectMember.find({ project_id: project._id, project_role: 'project_manager', status: 'active' }).lean();
      const pmIds = pms.map(m => m.user_id).filter(id => id.toString() !== user._id.toString());
      const pmUsers = await User.find({ _id: { $in: pmIds } }).select('email').lean();
      for (const u of pmUsers) {
        sendProjectNotification(u.email, `Module "${module.name}" and its sub-modules have been archived`, `Module "${module.name}" and ${subModules.length} sub-module(s) have been archived in "${project.name}".`);
      }
    }

    await writeAuditLog({ actorId: user._id, actorEmail: user.email, action: 'module.archived', targetType: 'module', targetId: module._id, changes: { archived: true, cascade: false }, ipAddress: req.ip });

    return res.json({ module: serializeModule(module) });
  } catch (err) {
    console.error('Archive module error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects/:projectId/modules/:moduleId/restore
app.post('/api/projects/:projectId/modules/:moduleId/restore', requireAuth, requireProjectWrite, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const project = await Project.findById(req.params.projectId).lean();
    if (!project) return res.status(404).json({ error: 'Project not found' });
    if (project.archived) return res.status(409).json({ error: 'Project is archived' });

    const module = await Module.findOne({ _id: req.params.moduleId, project_id: req.params.projectId });
    if (!module) return res.status(404).json({ error: 'Module not found' });
    if (!module.archived) return res.status(409).json({ error: 'Module is not archived' });

    // Sub-module: parent must be active
    if (module.parent_module_id) {
      const parent = await Module.findById(module.parent_module_id).lean();
      if (parent && parent.archived) return res.status(400).json({ error: 'Cannot restore sub-module while parent module is archived' });
    }

    // Name conflict check (restored name must still be available)
    const clash = await Module.findOne({ project_id: req.params.projectId, name_normalized: module.name_normalized, archived: false, _id: { $ne: module._id } }).lean();
    if (clash) return res.status(409).json({ error: `Cannot restore: module name "${module.name}" is already taken by another active module` });

    const user = req.authUser;
    module.archived = false;
    module.archived_at = null;
    module.archived_by = null;
    await module.save();

    await writeAuditLog({ actorId: user._id, actorEmail: user.email, action: 'module.restored', targetType: 'module', targetId: module._id, changes: { archived: false }, ipAddress: req.ip });

    return res.json({ module: serializeModule(module) });
  } catch (err) {
    console.error('Restore module error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
  connectWithRetry();
});
