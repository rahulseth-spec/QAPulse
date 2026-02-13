import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { User, WeeklyReport, Project } from './types';
import { MOCK_USERS, MOCK_PROJECTS, MOCK_REPORTS } from './constants';
import DashboardView from './views/DashboardView';
import EditorView from './views/EditorView';
import DetailView from './views/DetailView';
import DocumentationView from './views/DocumentationView';
import WeeklyReportView from './views/WeeklyReportView';
import { Layout } from './components/Layout';

const App: React.FC = () => {
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [reports, setReports] = useState<WeeklyReport[]>(MOCK_REPORTS);
  const [projects] = useState<Project[]>(MOCK_PROJECTS);
  
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; email?: string; password?: string; confirmPassword?: string; terms?: string }>({});
  const [passwordStrength, setPasswordStrength] = useState<'' | 'WEAK' | 'MEDIUM' | 'STRONG'>('');
  const [rememberMe, setRememberMe] = useState(false);
  const [capsLockOn, setCapsLockOn] = useState(false);
  const [oauthBusy, setOauthBusy] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotMessage, setForgotMessage] = useState('');
  const [forgotResetUrl, setForgotResetUrl] = useState('');
  const [forgotIsError, setForgotIsError] = useState(false);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('qapulse_auth');
    if (saved) {
      try {
        const { user } = JSON.parse(saved);
        setCurrentUser(user);
      } catch {}
    }
  }, []);

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
    const token = params.get('token');
    const userB64 = params.get('user');
    if (!token || !userB64) return;
    try {
      const user = fromBase64Url(userB64);
      setCurrentUser(user);
      localStorage.setItem('qapulse_auth', JSON.stringify({ token, user }));
      window.location.hash = '#/';
    } catch {}
  }, []);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const computeStrength = (pwd: string): '' | 'WEAK' | 'MEDIUM' | 'STRONG' => {
    if (!pwd) return '';
    const lengthScore = pwd.length >= 12 ? 2 : pwd.length >= 8 ? 1 : 0;
    const varietyScore = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].reduce((s, r) => s + (r.test(pwd) ? 1 : 0), 0);
    const score = lengthScore + varietyScore;
    if (score >= 5) return 'STRONG';
    if (score >= 3) return 'MEDIUM';
    return 'WEAK';
  };

  useEffect(() => {
    if (isSignup) {
      setPasswordStrength(computeStrength(password));
    } else {
      setPasswordStrength('');
    }
  }, [password, isSignup]);

  useEffect(() => {
    const remembered = localStorage.getItem('qapulse_remember_email');
    if (remembered) {
      setEmail(remembered);
      setRememberMe(true);
    }
  }, []);

  const validateLogin = () => {
    const next: typeof fieldErrors = {};
    if (!emailRegex.test(email.trim())) next.email = 'Enter a valid work email';
    if (!password.trim()) next.password = 'Password is required';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateSignup = () => {
    const next: typeof fieldErrors = {};
    if (!name.trim()) next.name = 'Full name is required';
    if (!emailRegex.test(email.trim())) next.email = 'Enter a valid work email';
    if (!password.trim()) next.password = 'Password is required';
    if (confirmPassword !== password) next.confirmPassword = 'Passwords do not match';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateLogin()) return;
    try {
      setIsLoading(true);
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }
      const user: User = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        projects: Array.isArray(data.user.projects) && data.user.projects.length > 0
          ? data.user.projects
          : MOCK_PROJECTS.map(p => p.id),
      };
      setCurrentUser(user);
      localStorage.setItem('qapulse_auth', JSON.stringify({ token: data.token, user }));
      if (rememberMe) {
        localStorage.setItem('qapulse_remember_email', email.trim());
      } else {
        localStorage.removeItem('qapulse_remember_email');
      }
    } catch (err) {
      setError('Network error. Ensure the API server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateSignup()) return;
    try {
      setIsLoading(true);
      const payload = {
        name: name.trim(),
        email: email.trim(),
        password,
        projects: projects.map(p => p.id),
      };
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Signup failed');
        return;
      }
      const user: User = {
        id: data.user.id,
        name: data.user.name,
        email: data.user.email,
        projects: Array.isArray(data.user.projects) && data.user.projects.length > 0
          ? data.user.projects
          : projects.map(p => p.id),
      };
      setCurrentUser(user);
      localStorage.setItem('qapulse_auth', JSON.stringify({ token: data.token, user }));
    } catch (err) {
      setError('Network error. Ensure the API server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddReport = (newReport: WeeklyReport) => {
    setReports(prev => [newReport, ...prev.filter(r => r.id !== newReport.id)]);
  };

  const handleDeleteReport = (id: string) => {
    setReports(prev => prev.filter(r => r.id !== id));
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
      const res = await fetch('/api/auth/forgot-password', {
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
      const res = await fetch('/api/auth/reset-password', {
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
        setIsSignup(false);
        setPassword('');
        setConfirmPassword('');
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
    const UserIcon = (props: { className?: string }) => (
      <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 21a8 8 0 1 0-16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
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
    const GoogleIcon = (props: { className?: string }) => (
      <svg className={props.className} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.8-5.4 3.8-3.2 0-5.9-2.7-5.9-5.9S8.8 6 12 6c1.8 0 3 .8 3.7 1.4l2.5-2.4C16.7 3.7 14.6 2.7 12 2.7 6.9 2.7 2.8 6.8 2.8 12S6.9 21.3 12 21.3c6.9 0 8.6-4.8 8.6-7.3 0-.5-.1-.9-.1-1.3H12Z"/>
      </svg>
    );

    const loginEnabled = emailRegex.test(email.trim()) && password.trim().length > 0;
    const signupEnabled = name.trim().length > 0 && emailRegex.test(email.trim()) && password.trim().length > 0 && confirmPassword === password;
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

            <h1 className="softqa-h1">{isSignup ? 'Create your account' : 'Welcome Back!'}</h1>
            <div className="softqa-subtitle">
              {isSignup ? 'Create an account to publish weekly QA reports.' : 'Sign in to access your reports and dashboard.'}
            </div>

            {error && <div className="softqa-banner">{error}</div>}

            <form onSubmit={isSignup ? handleSignup : handleLogin} style={{ marginTop: 18 }}>
              {isSignup && (
                <div style={{ marginTop: 16 }}>
                  <label className="softqa-label">Full Name</label>
                  <div className="softqa-field">
                    <span className="softqa-left-icon"><UserIcon /></span>
                    <input
                      type="text"
                      className={`softqa-input ${fieldErrors.name ? 'is-invalid' : ''}`}
                      placeholder="Enter your full name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      aria-invalid={!!fieldErrors.name}
                    />
                  </div>
                  {fieldErrors.name && <div className="softqa-error">{fieldErrors.name}</div>}
                </div>
              )}

              <div style={{ marginTop: 16 }}>
                <label className="softqa-label">Work Email</label>
                <div className="softqa-field">
                  <span className="softqa-left-icon"><MailIcon /></span>
                  <input
                    type="email"
                    className={`softqa-input ${fieldErrors.email ? 'is-invalid' : ''}`}
                    placeholder="email@company.com"
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
                    autoComplete={isSignup ? 'new-password' : 'current-password'}
                    onKeyDown={(e) => setCapsLockOn(e.getModifierState && e.getModifierState('CapsLock'))}
                    onKeyUp={(e) => setCapsLockOn(e.getModifierState && e.getModifierState('CapsLock'))}
                    onFocus={(e) => setCapsLockOn(e.getModifierState && e.getModifierState('CapsLock'))}
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
                {isSignup && passwordStrength && (
                  <div style={{ marginTop: 8, fontSize: 12, color: '#6B7280' }}>
                    Password strength: <span style={{ color: '#407B7E', fontWeight: 600 }}>{passwordStrength}</span>
                  </div>
                )}
              </div>

              {isSignup && (
                <div style={{ marginTop: 16 }}>
                  <label className="softqa-label">Confirm Password</label>
                  <div className="softqa-field">
                    <span className="softqa-left-icon"><LockIcon /></span>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className={`softqa-input ${fieldErrors.confirmPassword ? 'is-invalid' : ''}`}
                      placeholder="Repeat your password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      aria-invalid={!!fieldErrors.confirmPassword}
                      autoComplete="new-password"
                    />
                  </div>
                  {fieldErrors.confirmPassword && <div className="softqa-error">{fieldErrors.confirmPassword}</div>}
                </div>
              )}

              {!isSignup ? (
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
                    Forgot Password?
                  </button>
                </div>
              ) : (
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#6B7280' }}>
                  <input id="terms" type="checkbox" checked={termsAgreed} onChange={(e) => setTermsAgreed(e.target.checked)} />
                  <label htmlFor="terms">
                    I agree to <button type="button" className="softqa-link">Terms</button> & <button type="button" className="softqa-link">Privacy</button>
                  </label>
                </div>
              )}

              <div style={{ marginTop: 18 }}>
                <button
                  type="submit"
                  className="softqa-primary"
                  disabled={(isSignup ? !signupEnabled : !loginEnabled) || isLoading}
                  aria-busy={isLoading}
                  title={(isSignup ? !signupEnabled : !loginEnabled) ? 'Complete required fields to continue' : ''}
                >
                  {isLoading && <span className="softqa-spinner" />}
                  <span>{isLoading ? (isSignup ? 'Creating account…' : 'Signing in…') : (isSignup ? 'Create Account' : 'Sign In')}</span>
                </button>
              </div>

              <div className="softqa-divider">
                <div className="softqa-divider-line" />
                <div>OR</div>
                <div className="softqa-divider-line" />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  type="button"
                  className="softqa-oauth"
                  disabled={oauthBusy}
                  onClick={async () => {
                    setError('');
                    setOauthBusy(true);
                    try {
                      const res = await fetch('/api/auth/google/status');
                      const data = await res.json();
                      if (!res.ok || !data?.enabled) {
                        const missing = Array.isArray(data?.missing) ? data.missing.join(', ') : '';
                        setError(missing ? `Google sign-in is not configured (${missing}).` : 'Google sign-in is not configured.');
                        setOauthBusy(false);
                        return;
                      }
                      window.location.assign('/api/auth/google');
                    } catch {
                      setError('Network error. Ensure the API server is running.');
                      setOauthBusy(false);
                    }
                  }}
                >
                  <GoogleIcon />
                  <span>Continue with Google</span>
                </button>
              </div>

              <div style={{ marginTop: 18, fontSize: 13, color: '#6B7280', textAlign: 'center' }}>
                {isSignup ? 'Already have an account? ' : "Don’t have an account? "}
                <button
                  type="button"
                  className="softqa-link"
                  onClick={() => {
                    setIsSignup(!isSignup);
                    setError('');
                    setFieldErrors({});
                  }}
                >
                  {isSignup ? 'Sign In' : 'Sign Up'}
                </button>
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
                        placeholder="email@company.com"
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
            <h2 className="softqa-right-headline">Track Weekly QA Health with Confidence</h2>
            <div className="softqa-right-quote">
              “QAPulse keeps our weekly QA reporting consistent and decision-ready across projects.”
            </div>
            <div className="softqa-right-author">Senior QA Lead</div>
            <div className="softqa-logos">
              <span>Discord</span>
              <span>Mailchimp</span>
              <span>Grammarly</span>
              <span>Square</span>
              <span>Dropbox</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Layout user={currentUser} logout={() => { setCurrentUser(null); localStorage.removeItem('qapulse_auth'); setIsSignup(false); setEmail(''); setName(''); setPassword(''); setError(''); }}>
        <Routes>
          <Route path="/" element={<DashboardView reports={reports} projects={projects} user={currentUser} users={users} />} />
          <Route path="/weekly-reports" element={<WeeklyReportView reports={reports} projects={projects} user={currentUser} onUpdate={handleAddReport} />} />
          <Route path="/create" element={<EditorView onSave={handleAddReport} user={currentUser} projects={projects} users={users} />} />
          <Route path="/edit/:id" element={<EditorView onSave={handleAddReport} user={currentUser} projects={projects} users={users} reports={reports} />} />
          <Route path="/report/:id" element={<DetailView reports={reports} projects={projects} user={currentUser} users={users} onUpdate={handleAddReport} onDelete={handleDeleteReport} />} />
          <Route path="/docs" element={<DocumentationView />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;
