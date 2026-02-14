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

const envLocalPath = path.resolve(process.cwd(), '.env.local');
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath });
}
dotenv.config();

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

app.get('/api/reports', requireAuth, async (req, res) => {
  try {
    if (!dbReady) return res.status(503).json({ error: 'Database not ready' });
    const items = await WeeklyReport.find({ createdBy: req.userId }).sort({ updatedAt: -1 }).lean();
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
    const report = req.body || {};
    const reportId = String(report.id || '').trim();
    if (!reportId) return res.status(400).json({ error: 'Report id is required' });

    const otherOwner = await WeeklyReport.findOne({ reportId, createdBy: { $ne: req.userId } }).lean();
    if (otherOwner) {
      return res.status(403).json({ error: 'You do not have access to modify this report' });
    }

    const existing = await WeeklyReport.findOne({ reportId, createdBy: req.userId }).lean();
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
        userRecord = existing;
      } else {
        const user = {
          id: `mem-${Date.now()}`,
          name,
          email,
          googleId: sub,
          projects: [],
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
      userRecord = await User.create({
        name,
        email,
        googleId: sub,
        projects: [],
      });
    } else {
      existing.googleId = sub || existing.googleId;
      if (name) existing.name = name;
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
    const { name, email, password, projects = [] } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email, and password are required' });
    }
    const lower = email.toLowerCase().trim();
    if (!dbReady && DEV_MODE) {
      if (memUsers.has(lower)) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const user = {
        id: `mem-${Date.now()}`,
        name: name.trim(),
        email: lower,
        passwordHash,
        projects,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      memUsers.set(lower, user);
      const token = signToken(user.id);
      return res.status(201).json({ token, user });
    } else {
      const existing = await User.findOne({ email: lower });
      if (existing) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      const passwordHash = await bcrypt.hash(password, 10);
      const user = await User.create({
        name: name.trim(),
        email: lower,
        passwordHash,
        projects,
      });
      const token = signToken(user._id.toString());
      return res.status(201).json({ token, user });
    }
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
    const lower = email.toLowerCase();
    if (!dbReady && DEV_MODE) {
      const user = memUsers.get(lower);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const token = signToken(user.id);
      return res.json({ token, user });
    } else {
      const user = await User.findOne({ email: lower });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      if (!user.passwordHash) {
        return res.status(401).json({ error: 'Use Google sign-in for this account' });
      }
      const ok = await bcrypt.compare(password, user.passwordHash);
      if (!ok) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
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
