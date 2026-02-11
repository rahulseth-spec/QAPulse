import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from './models/User.js';

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
async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
    await User.init();
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
