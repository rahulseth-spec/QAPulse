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
import User from './models/User.js';
import WeeklyReport from './models/WeeklyReport.js';

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
app.use(cors());
app.use(express.json());

let dbReady = false;
const memUsers = new Map(); // email -> user (DEV_MODE fallback)
const googleStates = new Map(); // state -> { webOrigin, expiresAt }
let googleCertCache = { certs: null, expiresAt: 0 };

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
    mailTransport = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }

  return mailTransport;
}

async function sendResetPasswordEmail(toEmail, resetUrl) {
  const transport = getMailTransport();
  if (!transport) return false;
  const from = process.env.MAIL_FROM;

  const subject = 'Reset your QAPulse password';
  const text = `You requested a password reset for QAPulse.\n\nReset your password using this link:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.\n`;
  const html = `<p>You requested a password reset for <b>QAPulse</b>.</p><p><a href="${resetUrl}">Reset your password</a></p><p>If you did not request this, you can ignore this email.</p>`;

  await transport.sendMail({
    from,
    to: toEmail,
    subject,
    text,
    html,
  });

  return true;
}

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
    const json = Buffer.from(head, 'base64url').toString('utf8');
    return JSON.parse(json);
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
async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    await User.init();
    await WeeklyReport.init();
    dbReady = true;
    console.log('Connected to MongoDB Atlas and ensured indexes');
  } catch (err) {
    dbReady = false;
    console.error('MongoDB connection error:', err);
  }
}

function connectWithRetry() {
  connectDB().then(() => {
    if (!dbReady) {
      setTimeout(connectWithRetry, 5000);
    }
  });
}

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

app.get('/api/health', (_req, res) => {
  const state = mongoose.connection.readyState;
  res.json({ status: 'ok', dbReady, mongoState: state, devMode: DEV_MODE });
});

function requireAuth(req, res, next) {
  const auth = String(req.get('authorization') || '');
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1];
  if (!token) return res.status(401).json({ error: 'Missing auth token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const userId = payload?.userId;
    if (!userId) return res.status(401).json({ error: 'Invalid auth token' });
    req.userId = userId;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid auth token' });
  }
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
  if (v === 'user') return 'reportee';
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
  return raw
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function isManagerUser(user) {
  if (!user) return false;
  if (normalizeRole(user.role) === 'manager') return true;
  const email = String(user.email || '').toLowerCase().trim();
  if (!email) return false;
  return getManagerEmails().includes(email);
}

function shouldBeManagerEmail(email) {
  const lower = String(email || '').toLowerCase().trim();
  if (!lower) return false;
  return getManagerEmails().includes(lower);
}

function can(user, area, action) {
  if (isManagerUser(user)) return true;
  const perms = normalizePermissions(user?.permissions, user?.role);
  return Boolean(perms?.[area]?.[action]);
}

async function requireManager(req, res, next) {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const user = await User.findById(req.userId).lean();
    if (!user) return res.status(401).json({ error: 'Invalid auth user' });
    if (!isManagerUser(user)) return res.status(403).json({ error: 'Forbidden' });
    req.authUser = user;
    return next();
  } catch (err) {
    console.error('Require manager error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

app.get('/api/reports', requireAuth, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const user = await User.findById(req.userId).lean();
    if (!user) return res.status(401).json({ error: 'Invalid auth user' });

    if (!can(user, 'weeklyReports', 'view')) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const userProjects = Array.isArray(user.projects) ? user.projects.filter(Boolean) : [];
    const projectFilter = userProjects.length ? { projectId: { $in: [...userProjects, ''] } } : null;
    const query = isManagerUser(user)
      ? {}
      : (projectFilter ? { $or: [{ createdBy: req.userId }, projectFilter] } : { createdBy: req.userId });

    const items = await WeeklyReport.find(query).sort({ updatedAt: -1 }).lean();
    const normalized = items.map(doc => {
      const id = doc.reportId;
      const createdAt = doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt;
      const updatedAt = doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt;
      const { _id, __v, reportId, ...rest } = doc;
      return { id, createdAt, updatedAt, ...rest };
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
    const user = await User.findById(req.userId).lean();
    if (!user) return res.status(401).json({ error: 'Invalid auth user' });
    if (!can(user, 'weeklyReports', 'edit')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const report = req.body || {};
    const reportId = String(report.id || '').trim();
    if (!reportId) return res.status(400).json({ error: 'Report id is required' });

    const otherOwner = await WeeklyReport.findOne({ reportId, createdBy: { $ne: req.userId } }).lean();
    if (otherOwner && !isManagerUser(user)) {
      return res.status(403).json({ error: 'You do not have access to modify this report' });
    }

    const existing = await WeeklyReport.findOne({ reportId }).lean();
    const createdBy = existing?.createdBy || req.userId;
    const updatedBy = req.userId;
    const nextStatus = String(report.status || existing?.status || 'DRAFT');
    const publishedBy =
      nextStatus === 'PUBLISHED' ? (existing?.publishedBy || req.userId) : undefined;

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
      updatedBy,
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

app.get('/api/users', requireAuth, requireManager, async (_req, res) => {
  try {
    const users = await User.find({}).sort({ createdAt: -1 }).lean();
    const normalized = users.map(u => {
      const { _id, __v, passwordHash, googleId, resetPasswordTokenHash, resetPasswordExpiresAt, ...rest } = u;
      return {
        id: _id.toString(),
        ...rest,
        role: normalizeRole(u.role),
        permissions: normalizePermissions(u.permissions, u.role),
      };
    });
    return res.json({ users: normalized });
  } catch (err) {
    console.error('List users error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/users/invite', requireAuth, requireManager, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });

    const { email, name, role, projects = [], permissions } = req.body || {};
    const lower = String(email || '').toLowerCase().trim();
    const displayName = String(name || '').trim() || 'User';
    if (!lower) return res.status(400).json({ error: 'email is required' });

    const existing = await User.findOne({ email: lower }).lean();
    if (existing) return res.status(409).json({ error: 'User already exists' });

    const normalizedRole = normalizeRole(role);
    const nextProjects = Array.isArray(projects) ? projects.map(String).map(s => s.trim()).filter(Boolean) : [];
    const nextPermissions = normalizePermissions(permissions || {}, normalizedRole);

    const created = await User.create({
      name: displayName,
      email: lower,
      projects: nextProjects,
      role: normalizedRole,
      permissions: nextPermissions,
    });

    const token = randomBytes(24).toString('hex');
    created.resetPasswordTokenHash = makeTokenHash(token);
    created.resetPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
    await created.save();

    const expose = String(process.env.EXPOSE_RESET_URL).toLowerCase() === 'true' || DEV_MODE;
    const url = `${getWebOriginFromReq(req)}/#/reset-password?token=${encodeURIComponent(token)}`;

    if (getMailTransport()) {
      try {
        await sendResetPasswordEmail(lower, url);
      } catch (err) {
        console.error('Invite email send error:', err);
      }
    }

    const { _id, __v, passwordHash, googleId, resetPasswordTokenHash, resetPasswordExpiresAt, ...rest } = created.toJSON();
    return res.status(201).json({
      user: {
        id: _id.toString(),
        ...rest,
        role: normalizeRole(created.role),
        permissions: normalizePermissions(created.permissions, created.role),
      },
      ...(expose ? { resetUrl: url } : {}),
    });
  } catch (err) {
    console.error('Invite user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.patch('/api/users/:id', requireAuth, requireManager, async (req, res) => {
  try {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'User id is required' });

    const patch = req.body || {};
    const update = {};

    if (Array.isArray(patch.projects)) {
      update.projects = patch.projects.map(String).map(s => s.trim()).filter(Boolean);
    }

    if (typeof patch.role === 'string') {
      update.role = normalizeRole(patch.role);
    }

    if (patch.permissions && typeof patch.permissions === 'object') {
      update.permissions = normalizePermissions(patch.permissions, update.role || patch.role);
    }

    const saved = await User.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    if (!saved) return res.status(404).json({ error: 'User not found' });

    const { _id, __v, passwordHash, googleId, resetPasswordTokenHash, resetPasswordExpiresAt, ...rest } = saved;
    return res.json({
      user: {
        id: _id.toString(),
        ...rest,
        role: normalizeRole(saved.role),
        permissions: normalizePermissions(saved.permissions, saved.role),
      }
    });
  } catch (err) {
    console.error('Update user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    const lower = String(email || '').toLowerCase().trim();
    if (!lower) {
      return res.status(400).json({ error: 'email is required' });
    }

    let resetUrl;
    const expose = String(process.env.EXPOSE_RESET_URL).toLowerCase() === 'true' || DEV_MODE;
    const canEmail = !!getMailTransport();
    if (!canEmail && !expose) {
      return res.status(503).json({ error: 'Email service is not configured' });
    }

    if (!dbReady && DEV_MODE) {
      const user = memUsers.get(lower);
      if (user) {
        const token = randomBytes(24).toString('hex');
        user.resetPasswordTokenHash = makeTokenHash(token);
        user.resetPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
        const url = `${getWebOriginFromReq(req)}/#/reset-password?token=${encodeURIComponent(token)}`;
        if (canEmail) {
          try {
            await sendResetPasswordEmail(lower, url);
          } catch (err) {
            console.error('Reset email send error:', err);
          }
        }
        if (expose) resetUrl = url;
      }
      return res.json({
        message: 'If an account exists for that email, a reset link has been sent.',
        ...(resetUrl ? { resetUrl } : {}),
      });
    }

    if (!dbReady) {
      return res.status(503).json({ error: 'Database not ready' });
    }

    const user = await User.findOne({ email: lower });
    if (user) {
      const token = randomBytes(24).toString('hex');
      user.resetPasswordTokenHash = makeTokenHash(token);
      user.resetPasswordExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await user.save();
      const url = `${getWebOriginFromReq(req)}/#/reset-password?token=${encodeURIComponent(token)}`;
      if (canEmail) {
        try {
          await sendResetPasswordEmail(lower, url);
        } catch (err) {
          console.error('Reset email send error:', err);
        }
      }
      if (expose) resetUrl = url;
    }

    return res.json({
      message: 'If an account exists for that email, a reset link has been sent.',
      ...(resetUrl ? { resetUrl } : {}),
    });
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
    if (!rawToken || !nextPassword) {
      return res.status(400).json({ error: 'token and password are required' });
    }
    if (nextPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    if (!dbReady && DEV_MODE) {
      for (const [, user] of memUsers.entries()) {
        if (
          user.resetPasswordTokenHash &&
          user.resetPasswordTokenHash === makeTokenHash(rawToken) &&
          user.resetPasswordExpiresAt &&
          Date.parse(user.resetPasswordExpiresAt) > Date.now()
        ) {
          user.passwordHash = await bcrypt.hash(nextPassword, 10);
          delete user.resetPasswordTokenHash;
          delete user.resetPasswordExpiresAt;
          return res.json({ message: 'Password updated' });
        }
      }
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    if (!dbReady) {
      return res.status(503).json({ error: 'Database not ready' });
    }

    const user = await User.findOne({
      resetPasswordTokenHash: makeTokenHash(rawToken),
      resetPasswordExpiresAt: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    user.passwordHash = await bcrypt.hash(nextPassword, 10);
    user.resetPasswordTokenHash = undefined;
    user.resetPasswordExpiresAt = undefined;
    await user.save();
    return res.json({ message: 'Password updated' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/auth/google/status', (_req, res) => {
  const missing = [];
  if (!process.env.GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!process.env.GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  const enabled = missing.length === 0;
  res.json({ enabled, missing });
});

app.get('/api/auth/google', async (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return res.status(500).send('Missing GOOGLE_CLIENT_ID');
  }
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
    if (!clientId || !clientSecret) {
      return res.status(500).send('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET');
    }

    const code = String(req.query.code || '');
    const state = String(req.query.state || '');
    if (!code || !state) {
      return res.status(400).send('Missing code or state');
    }

    const stateData = googleStates.get(state);
    googleStates.delete(state);
    if (!stateData || stateData.expiresAt <= Date.now()) {
      return res.status(400).send('Invalid state');
    }

    const redirectUri = `${getApiOriginFromReq(req)}/api/auth/google/callback`;
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenResp.json();
    if (!tokenResp.ok) {
      return res.status(502).send('Google token exchange failed');
    }

    const idToken = tokenData.id_token;
    if (!idToken) {
      return res.status(502).send('Missing id_token');
    }

    const payload = await verifyGoogleIdToken(idToken, clientId);
    const email = String(payload.email || '').toLowerCase().trim();
    const name = String(payload.name || '').trim() || 'User';
    const sub = String(payload.sub || '').trim();
    if (!email) {
      return res.status(400).send('Google account missing email');
    }

    let userRecord;
    if (!dbReady && DEV_MODE) {
      const existing = memUsers.get(email);
      if (existing) {
        existing.googleId = sub || existing.googleId;
        existing.name = name || existing.name;
        const role = shouldBeManagerEmail(existing.email) ? 'manager' : normalizeRole(existing.role);
        existing.role = role;
        existing.permissions = normalizePermissions(existing.permissions, role);
        userRecord = existing;
      } else {
        if (!shouldBeManagerEmail(email)) {
          return res.redirect(`${stateData.webOrigin}/#/oauth-callback?error=${encodeURIComponent('Not invited. Ask your manager to invite you.')}`);
        }
        const role = 'manager';
        const user = {
          id: `mem-${Date.now()}`,
          name,
          email,
          googleId: sub,
          projects: [],
          role,
          permissions: normalizePermissions({}, role),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        memUsers.set(email, user);
        userRecord = user;
      }
      const token = signToken(userRecord.id);
      const userB64 = toBase64Url(JSON.stringify(userRecord));
      return res.redirect(`${stateData.webOrigin}/#/oauth-callback?token=${encodeURIComponent(token)}&user=${encodeURIComponent(userB64)}`);
    }

    if (!dbReady) {
      return res.status(503).send('Database not ready');
    }

    const existing = await User.findOne({ email });
    if (!existing) {
      if (!shouldBeManagerEmail(email)) {
        return res.redirect(`${stateData.webOrigin}/#/oauth-callback?error=${encodeURIComponent('Not invited. Ask your manager to invite you.')}`);
      }
      const role = 'manager';
      userRecord = await User.create({
        name,
        email,
        googleId: sub,
        projects: [],
        role,
        permissions: normalizePermissions({}, role),
      });
    } else {
      existing.googleId = sub || existing.googleId;
      if (name) existing.name = name;
      const role = shouldBeManagerEmail(existing.email) ? 'manager' : normalizeRole(existing.role);
      existing.role = role;
      existing.permissions = normalizePermissions(existing.permissions, role);
      await existing.save();
      userRecord = existing;
    }

    const token = signToken(userRecord._id.toString());
    const userB64 = toBase64Url(JSON.stringify(userRecord.toJSON()));
    return res.redirect(`${stateData.webOrigin}/#/oauth-callback?token=${encodeURIComponent(token)}&user=${encodeURIComponent(userB64)}`);
  } catch (err) {
    console.error('Google callback error:', err);
    return res.status(500).send('OAuth error');
  }
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    return res.status(403).json({ error: 'Signup is disabled. Ask your manager for an invite.' });
  } catch (err) {
    console.error('Signup error:', err);
    const msg = !dbReady && DEV_MODE ? 'Running in DEV_MODE without Mongo. Try again.' : 'Internal server error';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    const lower = String(email).trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(lower)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    if (String(password).trim().length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!dbReady && DEV_MODE) {
      const user = memUsers.get(lower);
      if (!user) {
        return res.status(404).json({ error: 'Invalid email' });
      }
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: 'Invalid password' });
      }
      const role = shouldBeManagerEmail(user.email) ? 'manager' : normalizeRole(user.role);
      user.role = role;
      user.permissions = normalizePermissions(user.permissions, role);
      const token = signToken(user.id);
      return res.json({ token, user });
    } else {
      if (!dbReady) {
        return res.status(503).json({ error: 'Database not ready' });
      }
      const user = await User.findOne({ email: lower });
      if (!user) {
        return res.status(404).json({ error: 'Invalid email' });
      }
      if (!user.passwordHash) {
        return res.status(401).json({ error: 'Invalid password' });
      }
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: 'Invalid password' });
      }
      const role = shouldBeManagerEmail(user.email) ? 'manager' : normalizeRole(user.role);
      user.role = role;
      user.permissions = normalizePermissions(user.permissions, role);
      await user.save();
      const token = signToken(user._id.toString());
      return res.json({ token, user });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`API server listening on http://localhost:${PORT}`);
  connectWithRetry();
});
