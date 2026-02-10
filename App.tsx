
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { User, WeeklyReport, Project } from './types';
import { MOCK_USERS, MOCK_PROJECTS, MOCK_REPORTS } from './constants';
import DashboardView from './views/DashboardView';
import EditorView from './views/EditorView';
import SearchView from './views/SearchView';
import DetailView from './views/DetailView';
import DocumentationView from './views/DocumentationView';
import WeeklyReportView from './views/WeeklyReportView';
import { Layout } from './components/Layout';

const App: React.FC = () => {
  const [users, setUsers] = useState<User[]>(MOCK_USERS);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [reports, setReports] = useState<WeeklyReport[]>(MOCK_REPORTS);
  const [projects] = useState<Project[]>(MOCK_PROJECTS);
  
  // Auth Form State
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedEmail = email.trim();
    const user = users.find(u => u.email.toLowerCase() === trimmedEmail.toLowerCase());
    
    if (!user) {
      setError('No account found with this email. Please check your spelling or sign up.');
      return;
    }

    if (password !== 'password') {
      setError('The password you entered is incorrect. (Default: "password")');
      return;
    }

    setCurrentUser(user);
    setError('');
  };

  const handleSignup = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Field Presence Validation
    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('All fields are required. Please fill in your name, email, and password.');
      return;
    }

    // Basic Email Format Validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please provide a valid email address (e.g., jane@example.com).');
      return;
    }

    // Password Length Validation
    if (password.length < 6) {
      setError('For your security, please use a password with at least 6 characters.');
      return;
    }

    // Duplicate User Check
    if (users.some(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
      setError('This email is already registered. Try signing in instead.');
      return;
    }

    const newUser: User = {
      id: `u-${Date.now()}`,
      name: name.trim(),
      email: email.trim(),
      projects: projects.map(p => p.id), // New users get access to all existing projects
    };

    setUsers(prev => [...prev, newUser]);
    setCurrentUser(newUser);
    setError('');
  };

  const handleAddReport = (newReport: WeeklyReport) => {
    setReports(prev => [newReport, ...prev.filter(r => r.id !== newReport.id)]);
  };

  const handleDeleteReport = (id: string) => {
    setReports(prev => prev.filter(r => r.id !== id));
  };

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white p-4">
        <div className="w-full max-w-md bg-slate-900 rounded-2xl shadow-2xl border border-slate-800 p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white text-3xl font-black mx-auto mb-4 shadow-xl shadow-blue-500/20">Q</div>
            <h1 className="text-3xl font-bold tracking-tight">
              {isSignup ? 'Create Account' : 'QASync Login'}
            </h1>
            <p className="text-slate-400 mt-2 text-sm">
              {isSignup ? 'Join the QA reporting platform' : 'Enter your credentials to manage reports'}
            </p>
          </div>

          <form onSubmit={isSignup ? handleSignup : handleLogin} className="space-y-5">
            {isSignup && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Full Name</label>
                <input
                  type="text"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-600 transition-all placeholder:text-slate-600"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Work Email</label>
              <input
                type="email"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-600 transition-all placeholder:text-slate-600"
                placeholder="email@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Password</label>
              <input
                type="password"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-600 transition-all placeholder:text-slate-600"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs p-4 rounded-xl flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
                <span className="mt-0.5">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-[0.98]"
            >
              {isSignup ? 'Sign Up' : 'Sign In'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button 
              onClick={() => {
                setIsSignup(!isSignup);
                setError('');
              }}
              className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors"
            >
              {isSignup ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
            </button>
          </div>

          {!isSignup && (
            <div className="mt-8 pt-6 border-t border-slate-800">
              <p className="text-center text-[10px] text-slate-500 uppercase font-bold tracking-widest">Available Mock Users</p>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {users.slice(0, 4).map(u => (
                  <button 
                    key={u.id}
                    onClick={() => {
                      setEmail(u.email);
                      setPassword('password');
                      setError('');
                    }}
                    className="text-[10px] bg-slate-800 hover:bg-slate-700 px-2 py-1 rounded text-slate-400 transition-colors"
                  >
                    {u.email}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <Router>
      <Layout user={currentUser} logout={() => { setCurrentUser(null); setIsSignup(false); setEmail(''); setName(''); setPassword(''); setError(''); }}>
        <Routes>
          <Route path="/" element={<DashboardView reports={reports} projects={projects} user={currentUser} users={users} />} />
          <Route path="/weekly-reports" element={<WeeklyReportView reports={reports} projects={projects} />} />
          <Route path="/search" element={<SearchView reports={reports} projects={projects} />} />
          <Route path="/create" element={<EditorView onSave={handleAddReport} user={currentUser} projects={projects} />} />
          <Route path="/edit/:id" element={<EditorView onSave={handleAddReport} user={currentUser} projects={projects} reports={reports} />} />
          <Route path="/report/:id" element={<DetailView reports={reports} projects={projects} user={currentUser} users={users} onUpdate={handleAddReport} onDelete={handleDeleteReport} />} />
          <Route path="/docs" element={<DocumentationView />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;
