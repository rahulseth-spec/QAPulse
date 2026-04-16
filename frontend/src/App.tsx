import React, { useState, useEffect, Component } from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { User, Project, hasPermission, normalizeRole } from './types';
import { MOCK_PROJECTS } from './constants';
import Dashboard from './pages/Dashboard';
import UsersPage from './pages/UsersPage';
import Roles from './pages/Roles';
import Projects from './pages/Projects';
import ProjectDetail from './pages/ProjectDetail';
import { apiUrl, looksLikeHtml, isRenderWakingPage, readJsonOrText } from './services/api';
import { Layout } from './components/Layout';

type RuntimeErrorState = {
  message: string;
  stack?: string;
  source?: 'render' | 'error' | 'promise';
};

class ErrorBoundary extends Component<
  { onError: (err: RuntimeErrorState) => void; children: React.ReactNode },
  { hasError: boolean }
> {
  declare props: { onError: (err: RuntimeErrorState) => void; children: React.ReactNode };
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: any) {
    const message = typeof error?.message === 'string' ? error.message : String(error);
    const stack = typeof error?.stack === 'string' ? error.stack : undefined;
    this.props.onError({ message, stack, source: 'render' });
  }

  render() {
    return this.props.children;
  }
}

const toSessionUser = (raw: any): User => ({
  id: raw.id,
  name: raw.name,
  email: raw.email,
  projects: Array.isArray(raw.projects) ? raw.projects : [],
  role: normalizeRole(raw.role),
  permissions: typeof raw.permissions === 'object' && raw.permissions ? raw.permissions : undefined,
  status: raw.status,
  role_id: raw.role_id ?? null,
  role_name: raw.role_name ?? null,
  last_login_at: raw.last_login_at ?? null,
  suspended_at: raw.suspended_at ?? null,
  archived_at: raw.archived_at ?? null,
  created_by: raw.created_by ?? null,
  createdAt: raw.createdAt,
  updatedAt: raw.updatedAt,
});

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [projects] = useState<Project[]>(MOCK_PROJECTS);
  const [runtimeError, setRuntimeError] = useState<RuntimeErrorState | null>(null);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [rememberMe, setRememberMe] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotResetUrl, setForgotResetUrl] = useState('');
  const [forgotIsError, setForgotIsError] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');

  const readStoredAuth = () => {
    const saved = localStorage.getItem('qapulse_auth');
    if (!saved) return null;
    try {
      const parsed = JSON.parse(saved);
      const token = typeof parsed?.token === 'string' ? parsed.token : null;
      const user = parsed?.user || null;
      const persistent = parsed?.persistent === true;
      const expiresAt = typeof parsed?.expiresAt === 'number' ? parsed.expiresAt : undefined;
      if (!token || !user) return null;
      if (persistent) {
        return { token, user, persistent: true as const };
      }
      if (typeof expiresAt !== 'number') {
        const nextExpiresAt = Date.now() + 24 * 60 * 60 * 1000;
        localStorage.setItem('qapulse_auth', JSON.stringify({ token, user, expiresAt: nextExpiresAt }));
        return { token, user, expiresAt: nextExpiresAt };
      }
      if (Date.now() > expiresAt) {
        localStorage.removeItem('qapulse_auth');
        return null;
      }
      return { token, user, expiresAt };
    } catch {
      return null;
    }
  };

  useEffect(() => {
    const auth = readStoredAuth();
    if (auth?.user) setCurrentUser(auth.user);
  }, []);

  useEffect(() => {
    const onErr = (e: ErrorEvent) => {
      const message = e.error?.message || e.message || 'Unknown error';
      const stack = e.error?.stack;
      setRuntimeError({ message, stack, source: 'error' });
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason: any = e.reason;
      const message = reason?.message || String(reason || 'Unhandled promise rejection');
      const stack = reason?.stack;
      setRuntimeError({ message, stack, source: 'promise' });
    };
    window.addEventListener('error', onErr);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onErr);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  const getAuthToken = () => {
    const auth = readStoredAuth();
    return auth?.token || null;
  };

  const setSessionUser = (nextUser: User | null) => {
    setCurrentUser(nextUser);
    if (!nextUser) {
      localStorage.removeItem('qapulse_auth');
      return;
    }
    const existing = readStoredAuth();
    if (!existing?.token) return;
    localStorage.setItem(
      'qapulse_auth',
      JSON.stringify({
        token: existing.token,
        user: nextUser,
        ...(existing.persistent ? { persistent: true } : {}),
        ...(typeof existing.expiresAt === 'number' ? { expiresAt: existing.expiresAt } : {}),
      })
    );
  };

  useEffect(() => {
    if (!currentUser) return;
    const auth = readStoredAuth();
    if (!auth?.expiresAt) return;
    const ms = auth.expiresAt - Date.now();
    if (ms <= 0) {
      setSessionUser(null);
      return;
    }
    const id = window.setTimeout(() => setSessionUser(null), ms);
    return () => window.clearTimeout(id);
  }, [currentUser?.id]);


  const parseHashRoute = () => {
    const raw = window.location.hash || '';
    const cleaned = raw.startsWith('#') ? raw.slice(1) : raw;
    const [pathPart, queryPart] = cleaned.split('?');
    const path = pathPart?.startsWith('/') ? pathPart : `/${pathPart || ''}`;
    const params = new URLSearchParams(queryPart || '');
    return { path, params };
  };

  const fromBase64Url = (value: string) => {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + '='.repeat(padLen);
    const json = decodeURIComponent(
      Array.from(atob(padded))
        .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json);
  };

  useEffect(() => {
    const { path, params } = parseHashRoute();
    if (path !== '/oauth-callback') return;
    const oauthError = params.get('error');
    if (oauthError) {
      setError(oauthError);
      window.location.hash = '#/';
      return;
    }
    const token = params.get('token');
    const userB64 = params.get('user');
    if (!token || !userB64) return;
    try {
      const user = toSessionUser(fromBase64Url(userB64));
      setCurrentUser(user);
      localStorage.setItem('qapulse_auth', JSON.stringify({ token, user, expiresAt: Date.now() + 24 * 60 * 60 * 1000 }));
      window.location.hash = '#/';
    } catch {}
  }, []);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateLogin = () => {
    const next: typeof fieldErrors = {};
    if (!emailRegex.test(email.trim())) next.email = 'Invalid email';
    if (password.trim().length < 8) next.password = 'Password must be at least 8 characters';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateLogin()) return;
    try {
      setIsLoading(true);
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const parsed = await readJsonOrText(res);
      const data = parsed.kind === 'json' ? parsed.data : null;
      if (!res.ok) {
        if (parsed.kind === 'text' && isRenderWakingPage(parsed.text)) {
          setError('Backend is waking up on Render. Try again in 20–30 seconds.');
        } else {
          const msg = (typeof data?.error === 'string' && data.error) || (parsed.kind === 'text' ? parsed.text : '') || 'Login failed';
          if (msg === 'Invalid email') {
            setFieldErrors({ email: 'Invalid email' });
          } else if (msg === 'Invalid password') {
            setFieldErrors({ password: 'Invalid password' });
          } else if (msg === 'Password must be at least 8 characters') {
            setFieldErrors({ password: 'Password must be at least 8 characters' });
          } else {
            setError(msg);
          }
        }
        return;
      }
      if (!data?.user || !data?.token) {
        const msg =
          parsed.kind === 'text' && isRenderWakingPage(parsed.text)
            ? 'Backend is waking up on Render. Try again in 20–30 seconds.'
            : parsed.kind === 'text' && looksLikeHtml(parsed.text)
              ? 'API returned HTML (not JSON). Ensure VITE_API_BASE_URL points to your backend.'
              : 'Unexpected API response. Check VITE_API_BASE_URL configuration.';
        setError(msg);
        return;
      }
      const user = toSessionUser(data.user);
      setCurrentUser(user);
      localStorage.setItem(
        'qapulse_auth',
        JSON.stringify({
          token: data.token,
          user,
          ...(rememberMe ? { persistent: true } : { expiresAt: Date.now() + 24 * 60 * 60 * 1000 }),
        })
      );
      localStorage.removeItem('qapulse_remember_email');
    } catch (err) {
      setError('Network error. Ensure the API server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setForgotMessage('');
    setForgotResetUrl('');
    setForgotIsError(false);
    setError('');
    const target = (forgotEmail || email).trim();
    if (!emailRegex.test(target)) {
      setForgotMessage('Enter a valid work email.');
      setForgotIsError(true);
      return;
    }
    try {
      setIsLoading(true);
      const res = await fetch(apiUrl('/api/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target }),
      });
      const data = await res.json();
      if (!res.ok) {
        setForgotMessage(data.error || 'Request failed');
        setForgotIsError(true);
        return;
      }
      setForgotMessage(data.message || 'Check your email for a reset link.');
      if (data.resetUrl) setForgotResetUrl(String(data.resetUrl));
    } catch {
      setForgotMessage('Network error. Ensure the API server is running.');
      setForgotIsError(true);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMessage('');
    setResetError('');
    const { params } = parseHashRoute();
    const token = params.get('token') || '';
    if (!token) {
      setResetError('Missing reset token.');
      return;
    }
    if (!resetPassword || resetPassword.length < 8) {
      setResetError('Password must be at least 8 characters.');
      return;
    }
    if (resetConfirm !== resetPassword) {
      setResetError('Passwords do not match.');
      return;
    }
    try {
      setIsLoading(true);
      const res = await fetch(apiUrl('/api/auth/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password: resetPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetError(data.error || 'Reset failed');
        return;
      }
      setResetMessage(data.message || 'Password updated.');
      setTimeout(() => {
        setPassword('');
        setResetPassword('');
        setResetConfirm('');
        window.location.hash = '#/';
      }, 600);
    } catch {
      setResetError('Network error. Ensure the API server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!currentUser) {
    const PulseIcon = (props: { className?: string }) => (
      <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 12h4l2-5 4 10 2-5h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
    const MailIcon = (props: { className?: string }) => (
      <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 6h16v12H4V6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M4 7l8 6 8-6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
    const LockIcon = (props: { className?: string }) => (
      <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 11V8a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M6 11h12v9H6v-9Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
    const EyeIcon = (props: { className?: string }) => (
      <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
    const EyeOffIcon = (props: { className?: string }) => (
      <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M9.2 5.4A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-4 5.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6.1 6.1C3.7 8.1 2 12 2 12s3.5 7 10 7c1.1 0 2.1-.2 3-.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
    const CheckIcon = (props: { className?: string }) => (
      <svg className={props.className} width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );

    const loginEnabled = emailRegex.test(email.trim()) && password.trim().length >= 8;
    const { path: authPath } = parseHashRoute();

    return (
      <div className="softqa-shell">
        <div className="softqa-left">
          <div className="softqa-topbrand">
            <div className="softqa-brand">
              <div className="softqa-mark">
                <PulseIcon />
              </div>
              <div className="softqa-brand-title">
                <div className="softqa-brand-name">
                  <span style={{ fontWeight: 800 }}>QA</span>
                  <span style={{ fontWeight: 600 }}>Pulse</span>
                </div>
                <div className="softqa-brand-byline">by <span style={{ fontWeight: 700 }}>ConveGenius</span></div>
              </div>
            </div>
          </div>

          <div className="softqa-card">
            {authPath === '/reset-password' ? (
              <>
                <h1 className="softqa-h1">Reset Password</h1>
                <div className="softqa-subtitle">Create a new password to regain access.</div>

                {(resetError || resetMessage) && (
                  <div className={resetError ? 'softqa-banner' : 'softqa-banner'} style={resetError ? undefined : { background: 'rgba(64, 123, 126, 0.10)', borderColor: 'rgba(64, 123, 126, 0.25)', color: '#073D44' }}>
                    {resetError || resetMessage}
                  </div>
                )}

                <form onSubmit={handleResetPassword} style={{ marginTop: 18 }}>
                  <div style={{ marginTop: 16 }}>
                    <label className="softqa-label">New Password</label>
                    <div className="softqa-field">
                      <span className="softqa-left-icon"><LockIcon /></span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="softqa-input"
                        style={{ paddingRight: 44 }}
                        placeholder="Enter a new password"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        className="softqa-right-action"
                        onClick={() => setShowPassword(v => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                      </button>
                    </div>
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <label className="softqa-label">Confirm Password</label>
                    <div className="softqa-field">
                      <span className="softqa-left-icon"><LockIcon /></span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="softqa-input"
                        placeholder="Repeat new password"
                        value={resetConfirm}
                        onChange={(e) => setResetConfirm(e.target.value)}
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 18 }}>
                    <button type="submit" className="softqa-primary" disabled={isLoading}>
                      {isLoading && <span className="softqa-spinner" />}
                      <span>{isLoading ? 'Updating…' : 'Update Password'}</span>
                    </button>
                  </div>

                  <div style={{ marginTop: 18, fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
                    <button type="button" className="softqa-link" onClick={() => { window.location.hash = '#/'; }}>
                      Back to Sign In
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>

            <h1 className="softqa-h1">Welcome Back!</h1>
            <div className="softqa-subtitle">Time to pulse-check</div>

            {error && <div className="softqa-banner">{error}</div>}

            <form onSubmit={handleLogin} style={{ marginTop: 18 }}>
              <div style={{ marginTop: 16 }}>
                <label className="softqa-label">Work Email</label>
                <div className="softqa-field">
                  <span className="softqa-left-icon"><MailIcon /></span>
                  <input
                    type="email"
                    className={`softqa-input ${fieldErrors.email ? 'is-invalid' : ''}`}
                    placeholder="name@convegenius.ai"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={!!fieldErrors.email}
                    autoComplete="email"
                  />
                </div>
                {fieldErrors.email && <div className="softqa-error">{fieldErrors.email}</div>}
              </div>

              <div style={{ marginTop: 16 }}>
                <label className="softqa-label">Password</label>
                <div className="softqa-field">
                  <span className="softqa-left-icon"><LockIcon /></span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className={`softqa-input ${fieldErrors.password ? 'is-invalid' : ''}`}
                    style={{ paddingRight: 44 }}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={!!fieldErrors.password}
                    autoComplete="current-password"
                    onKeyDown={(e) => setCapsLockOn(e.getModifierState && e.getModifierState('CapsLock'))}
                    onKeyUp={(e) => setCapsLockOn(e.getModifierState && e.getModifierState('CapsLock'))}
                    onFocus={() => setCapsLockOn(false)}
                  />
                  <button
                    type="button"
                    className="softqa-right-action"
                    onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOffIcon /> : <EyeIcon />}
                  </button>
                </div>
                {fieldErrors.password && <div className="softqa-error">{fieldErrors.password}</div>}
                {capsLockOn && <div className="softqa-error" style={{ color: '#407B7E' }}>Caps Lock is on</div>}
              </div>

              <div className="softqa-meta-row">
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
                  <span>Remember me</span>
                </label>
                <button
                  type="button"
                  className="softqa-link"
                  onClick={() => {
                    setForgotEmail(email.trim());
                    setForgotMessage('');
                    setForgotResetUrl('');
                    setForgotIsError(false);
                    setForgotOpen(true);
                  }}
                >
                  Forgot password?
                </button>
              </div>

              <div style={{ marginTop: 18 }}>
                <button
                  type="submit"
                  className="softqa-primary"
                  disabled={!loginEnabled || isLoading}
                  aria-busy={isLoading}
                  title={!loginEnabled ? 'Complete required fields to continue' : ''}
                >
                  {isLoading && <span className="softqa-spinner" />}
                  <span>{isLoading ? 'Signing in…' : 'Sign In'}</span>
                </button>
              </div>

              <div style={{ marginTop: 18, fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
                Don’t have an account? Ask your manager to invite you.
              </div>
            </form>

            {forgotOpen && (
              <div className="softqa-modal-backdrop" role="dialog" aria-modal="true">
                <div className="softqa-modal">
                  <div className="softqa-modal-title">Reset your password</div>
                  <div className="softqa-modal-subtitle">We’ll send a password reset link to your email.</div>

                  <div style={{ marginTop: 14 }}>
                    <label className="softqa-label">Work Email</label>
                    <div className="softqa-field">
                      <input
                        type="email"
                        className="softqa-input"
                        style={{ paddingLeft: 16 }}
                        placeholder="name@convegenius.ai"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  {(forgotMessage || forgotResetUrl) && (
                    <div style={{ marginTop: 12, fontSize: 13, color: forgotIsError ? '#B91C1C' : '#6B7280' }}>
                      {forgotMessage}
                      {forgotResetUrl && (
                        <div style={{ marginTop: 8 }}>
                          <a className="softqa-link" href={forgotResetUrl}>
                            Open reset link
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="softqa-modal-actions">
                    <button
                      type="button"
                      className="softqa-secondary"
                      onClick={() => {
                        setForgotOpen(false);
                        setForgotMessage('');
                        setForgotResetUrl('');
                        setForgotIsError(false);
                      }}
                      disabled={isLoading}
                    >
                      Cancel
                    </button>
                    <button type="button" className="softqa-primary" style={{ width: 'auto', padding: '0 14px' }} onClick={handleForgotPassword} disabled={isLoading}>
                      {isLoading && <span className="softqa-spinner" />}
                      <span>{isLoading ? 'Sending…' : 'Send reset link'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
              </>
            )}
          </div>
        </div>

        <div className="softqa-right">
          <div className="softqa-right-inner">
            <svg className="softqa-right-pulse" viewBox="0 0 640 180" fill="none" aria-hidden="true" preserveAspectRatio="none">
              <path
                d="M0 110H120L150 70L180 140L210 95H275L305 35L345 160L380 85H640"
                stroke="rgba(255,255,255,0.55)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>

            <h2 className="softqa-right-headline">Track Weekly QA Health</h2>
            <div className="softqa-right-subtext">Draft, publish, and search QA snapshots across projects.</div>

            <div className="softqa-right-bullets" role="list">
              <div className="softqa-right-bullet" role="listitem">
                <span className="softqa-right-bullet-icon" aria-hidden="true"><CheckIcon /></span>
                <span>Standard weekly reporting template</span>
              </div>
              <div className="softqa-right-bullet" role="listitem">
                <span className="softqa-right-bullet-icon" aria-hidden="true"><CheckIcon /></span>
                <span>Risks, blockers, and follow-ups captured clearly</span>
              </div>
              <div className="softqa-right-bullet" role="listitem">
                <span className="softqa-right-bullet-icon" aria-hidden="true"><CheckIcon /></span>
                <span>Search by project, month, and week</span>
              </div>
            </div>

            <div className="softqa-right-footer">
              <div className="softqa-right-divider" aria-hidden="true" />
              <div className="softqa-right-footnote">Internal tool for ConveGenius QA teams</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Layout user={currentUser} logout={() => { setSessionUser(null); setEmail(''); setPassword(''); setRememberMe(false); setError(''); }}>
        <ErrorBoundary onError={(err) => setRuntimeError(err)}>
          {(() => {
            const token = getAuthToken() || '';
            const home =
              hasPermission(currentUser, 'dashboard', 'view') ? '/' :
              hasPermission(currentUser, 'userManagement', 'view') ? '/users' :
              '/';
            const deny = (title: string) => (
              <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm p-8">
                <div className="text-[16px] font-bold text-slate-900">Access denied</div>
                <div className="mt-2 text-[13px] text-slate-600 font-semibold">{title}</div>
              </div>
            );

            return (
          <Routes>
            <Route path="/" element={hasPermission(currentUser, 'dashboard', 'view') ? <Dashboard user={currentUser} /> : <Navigate to={home} />} />
            <Route path="/projects" element={token && hasPermission(currentUser, 'projectManagement', 'view') ? <Projects user={currentUser} token={token} onUnauthorized={() => setSessionUser(null)} /> : deny('You do not have permission to view projects.')} />
            <Route path="/projects/:id" element={token && hasPermission(currentUser, 'projectManagement', 'view') ? <ProjectDetail user={currentUser} token={token} onUnauthorized={() => setSessionUser(null)} /> : deny('You do not have permission to view projects.')} />
            <Route path="/users" element={token && hasPermission(currentUser, 'userManagement', 'view') ? <UsersPage user={currentUser} projects={projects} token={token} onSelfUpdated={(u) => setSessionUser(u)} onUnauthorized={() => setSessionUser(null)} /> : deny('You do not have permission to manage users.')} />
            <Route path="/roles" element={token && hasPermission(currentUser, 'roleManagement', 'view') ? <Roles user={currentUser} token={token} onUnauthorized={() => setSessionUser(null)} /> : deny('You do not have permission to manage roles.')} />
            <Route path="*" element={<Navigate to={home} />} />
          </Routes>
            );
          })()}
        </ErrorBoundary>

        {runtimeError && (
          <div className="fixed inset-0 z-[9999] bg-black/70 flex items-center justify-center p-4">
            <div className="w-full max-w-3xl rounded-2xl bg-white shadow-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-extrabold text-slate-900 tracking-tight">App error</div>
                  <div className="mt-1 text-[12px] text-slate-500 truncate">
                    Source: {runtimeError.source || 'unknown'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setRuntimeError(null)}
                    className="h-9 px-3 rounded-xl bg-slate-100 text-slate-700 font-semibold text-[12px] hover:bg-slate-200 transition-colors"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="h-9 px-3 rounded-xl bg-[#073D44] text-white font-semibold text-[12px] hover:bg-[#073D44]/90 transition-colors"
                  >
                    Reload
                  </button>
                </div>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="text-[13px] font-semibold text-slate-900">{runtimeError.message}</div>
                {runtimeError.stack ? (
                  <pre className="text-[11px] leading-[16px] bg-slate-50 border border-slate-200 rounded-xl p-3 overflow-auto max-h-[50vh] whitespace-pre-wrap">
                    {runtimeError.stack}
                  </pre>
                ) : (
                  <div className="text-[12px] text-slate-500">No stack trace available.</div>
                )}
              </div>
            </div>
          </div>
        )}
      </Layout>
    </Router>
  );
};

export default App;
