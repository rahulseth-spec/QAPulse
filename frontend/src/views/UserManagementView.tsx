import React, { useEffect, useMemo, useState } from 'react';
import { Project, User, PermissionArea, Permissions, DEFAULT_PERMISSIONS_BY_ROLE, effectivePermissions, hasPermission, normalizeRole } from '../types';

type ApiUser = User & {
  createdAt?: string;
  updatedAt?: string;
  permissions?: Partial<Permissions>;
};

interface UserManagementViewProps {
  user: User;
  projects: Project[];
  token: string;
  apiUrl: (path: string) => string;
  onSelfUpdated: (nextUser: User) => void;
}

const areas: Array<{ key: PermissionArea; label: string; supportsEdit: boolean }> = [
  { key: 'dashboard', label: 'Dashboard', supportsEdit: false },
  { key: 'weeklyReports', label: 'Weekly Report', supportsEdit: true },
  { key: 'docs', label: 'FAQ', supportsEdit: false },
  { key: 'userManagement', label: 'User Management', supportsEdit: true },
];

const UserManagementView: React.FC<UserManagementViewProps> = ({ user, projects, token, apiUrl, onSelfUpdated }) => {
  const [items, setItems] = useState<ApiUser[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saveOk, setSaveOk] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState<'manager' | 'qaOwner' | 'reportee'>('reportee');
  const [inviteProjectIds, setInviteProjectIds] = useState<string[]>([]);
  const [inviteError, setInviteError] = useState('');
  const [inviteResetUrl, setInviteResetUrl] = useState('');

  const selected = useMemo(() => items.find(u => u.id === selectedId) || null, [items, selectedId]);
  const [role, setRole] = useState<'manager' | 'qaOwner' | 'reportee'>(() => normalizeRole(user?.role));
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [perms, setPerms] = useState<Permissions>(() => effectivePermissions(user));
  const canManage = hasPermission(user, 'userManagement', 'edit');

  useEffect(() => {
    if (!hasPermission(user, 'userManagement', 'view')) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await fetch(apiUrl('/api/users'), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = typeof data?.error === 'string' ? data.error : 'Unable to load users';
          if (!cancelled) setError(msg);
          return;
        }
        const nextUsers = Array.isArray(data?.users) ? (data.users as ApiUser[]) : [];
        if (!cancelled) {
          setItems(nextUsers);
          const first = nextUsers[0]?.id;
          if (first) setSelectedId(prev => prev || first);
        }
      } catch {
        if (!cancelled) setError('Unable to load users');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, apiUrl, user.id]);

  useEffect(() => {
    if (!selected) return;
    setRole(normalizeRole(selected.role));
    setProjectIds(Array.isArray(selected.projects) ? selected.projects : []);
    setPerms(effectivePermissions(selected));
    setSaveError('');
    setSaveOk('');
  }, [selectedId]);

  const toggleProject = (id: string) => {
    setProjectIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const togglePerm = (area: PermissionArea, field: 'view' | 'edit') => {
    setPerms(prev => ({
      ...prev,
      [area]: { ...prev[area], [field]: !prev[area][field] },
    }));
  };

  const openInvite = () => {
    setInviteEmail('');
    setInviteName('');
    setInviteRole('reportee');
    setInviteProjectIds([]);
    setInviteError('');
    setInviteResetUrl('');
    setInviteOpen(true);
  };

  const toggleInviteProject = (id: string) => {
    setInviteProjectIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const invite = async () => {
    if (!canManage) return;
    const email = inviteEmail.trim().toLowerCase();
    const name = inviteName.trim();
    if (!email) {
      setInviteError('Email is required');
      return;
    }
    if (!name) {
      setInviteError('Name is required');
      return;
    }
    setInviting(true);
    setInviteError('');
    setInviteResetUrl('');
    try {
      const res = await fetch(apiUrl('/api/users/invite'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          email,
          name,
          role: inviteRole,
          projects: inviteProjectIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data?.error === 'string' ? data.error : 'Unable to invite user';
        setInviteError(msg);
        return;
      }
      const created = data?.user as ApiUser | undefined;
      if (!created?.id) {
        setInviteError('Unable to invite user');
        return;
      }
      setItems(prev => [created, ...prev.filter(u => u.id !== created.id)]);
      setSelectedId(created.id);
      if (typeof data?.resetUrl === 'string' && data.resetUrl) {
        setInviteResetUrl(data.resetUrl);
      }
    } catch {
      setInviteError('Unable to invite user');
    } finally {
      setInviting(false);
    }
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setSaveError('');
    setSaveOk('');
    try {
      const res = await fetch(apiUrl(`/api/users/${encodeURIComponent(selected.id)}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          role,
          projects: projectIds,
          permissions: perms,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data?.error === 'string' ? data.error : 'Unable to save user';
        setSaveError(msg);
        return;
      }
      const saved = data?.user as ApiUser | undefined;
      if (!saved?.id) {
        setSaveError('Unable to save user');
        return;
      }
      setItems(prev => prev.map(u => (u.id === saved.id ? saved : u)));
      if (saved.id === user.id) {
        onSelfUpdated(saved);
      }
      setSaveOk('Saved');
    } catch {
      setSaveError('Unable to save user');
    } finally {
      setSaving(false);
      window.setTimeout(() => setSaveOk(''), 1500);
    }
  };

  if (!hasPermission(user, 'userManagement', 'view')) {
    return (
      <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm p-8">
        <div className="text-[16px] font-bold text-slate-900">Access denied</div>
        <div className="mt-2 text-[13px] text-slate-600 font-semibold">You do not have permission to view user management.</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden">
        <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15">
          <div className="text-[16px] font-extrabold text-[#073D44] tracking-tight">User Management</div>
          <div className="mt-1 text-[12px] text-[#073D44]/70 font-semibold">Manage project access and tab permissions</div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr]">
          <div className="border-b lg:border-b-0 lg:border-r border-slate-200">
            <div className="p-5">
              {canManage && (
                <button
                  type="button"
                  onClick={openInvite}
                  className="h-10 w-full mb-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] hover:bg-[#073D44]/90 transition-colors"
                >
                  Invite User
                </button>
              )}
              {loading ? (
                <div className="text-[13px] text-slate-500 font-semibold">Loading users…</div>
              ) : error ? (
                <div className="text-[13px] text-rose-700 font-semibold">{error}</div>
              ) : (
                <div className="space-y-2">
                  {items.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelectedId(u.id)}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                        u.id === selectedId
                          ? 'bg-[#073D44] text-white border-[#073D44]'
                          : 'bg-white text-slate-900 border-slate-200 hover:border-[#407B7E]/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className={`text-[13px] font-bold truncate ${u.id === selectedId ? 'text-white' : 'text-slate-900'}`}>{u.name}</div>
                          <div className={`text-[11px] font-semibold truncate ${u.id === selectedId ? 'text-white/75' : 'text-slate-500'}`}>{u.email}</div>
                        </div>
                        {(() => {
                          const r = normalizeRole(u.role);
                          const label = r === 'manager' ? 'MANAGER' : (r === 'qaOwner' ? 'QA OWNER' : 'REPORTEE');
                          const cls = r === 'manager'
                            ? (u.id === selectedId ? 'bg-white/15 text-white' : 'bg-emerald-50 text-emerald-700')
                            : (u.id === selectedId ? 'bg-white/10 text-white/90' : 'bg-slate-100 text-slate-600');
                          return (
                            <div className={`text-[10px] font-extrabold uppercase tracking-widest px-2 py-1 rounded-lg ${cls}`}>
                              {label}
                            </div>
                          );
                        })()}
                      </div>
                    </button>
                  ))}
                  {!items.length && <div className="text-[13px] text-slate-500 font-semibold">No users found.</div>}
                </div>
              )}
            </div>
          </div>

          <div className="p-6">
            {!selected ? (
              <div className="text-[13px] text-slate-500 font-semibold">Select a user to edit permissions.</div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[18px] font-extrabold text-slate-900 tracking-tight truncate">{selected.name}</div>
                    <div className="mt-1 text-[12px] text-slate-500 font-semibold truncate">{selected.email}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={save}
                      disabled={saving}
                      className="h-10 px-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] hover:bg-[#073D44]/90 disabled:opacity-60 transition-colors"
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>

                {(saveError || saveOk) && (
                  <div className={`text-[12px] font-semibold ${saveError ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {saveError || saveOk}
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                    <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Role</div>
                    <div className="mt-3">
                      <select
                        value={role}
                        onChange={(e) => {
                          const nextRole = normalizeRole(e.target.value);
                          setRole(nextRole);
                          setPerms(JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS_BY_ROLE[nextRole])));
                        }}
                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                      >
                        <option value="reportee">Reportee</option>
                        <option value="qaOwner">QA Owner</option>
                        <option value="manager">Manager</option>
                      </select>
                    </div>
                    <div className="mt-3 text-[12px] text-slate-500 font-semibold">
                      Manager has full access like super admin.
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                    <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Projects</div>
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {projects.map(p => (
                        <label key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
                          <input
                            type="checkbox"
                            checked={projectIds.includes(p.id)}
                            onChange={() => toggleProject(p.id)}
                            className="h-4 w-4 accent-[#073D44]"
                          />
                          <span className="text-[13px] font-semibold text-slate-800 truncate">{p.code}</span>
                        </label>
                      ))}
                      {!projects.length && <div className="text-[13px] text-slate-500 font-semibold">No projects configured.</div>}
                    </div>
                    <div className="mt-3 text-[12px] text-slate-500 font-semibold">
                      Users can view reports for assigned projects.
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15">
                    <div className="text-[12px] font-extrabold uppercase tracking-widest text-[#073D44]">Tab Permissions</div>
                  </div>
                  <div className="p-5 space-y-3">
                    {areas.map(a => (
                      <div key={a.key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-slate-200 rounded-2xl p-4">
                        <div className="min-w-0">
                          <div className="text-[13px] font-bold text-slate-900">{a.label}</div>
                          <div className="mt-1 text-[12px] text-slate-500 font-semibold">
                            {a.supportsEdit ? 'View + Edit supported' : 'View only'}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-2 text-[12px] font-semibold text-slate-700">
                            <input
                              type="checkbox"
                              checked={perms[a.key].view}
                              onChange={() => togglePerm(a.key, 'view')}
                              className="h-4 w-4 accent-[#073D44]"
                            />
                            View
                          </label>
                          <label className={`flex items-center gap-2 text-[12px] font-semibold ${a.supportsEdit ? 'text-slate-700' : 'text-slate-400'}`}>
                            <input
                              type="checkbox"
                              checked={perms[a.key].edit}
                              disabled={!a.supportsEdit}
                              onChange={() => togglePerm(a.key, 'edit')}
                              className="h-4 w-4 accent-[#073D44]"
                            />
                            Edit
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {saveError && <div className="text-[12px] font-semibold text-rose-700">{saveError}</div>}
              </div>
            )}
          </div>
        </div>
      </div>
      {inviteOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-[20px] shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[16px] font-extrabold text-[#073D44] tracking-tight">Invite User</div>
                <div className="mt-1 text-[12px] text-[#073D44]/70 font-semibold">Creates the user and sends a password setup link.</div>
              </div>
              <button
                type="button"
                onClick={() => setInviteOpen(false)}
                className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-[13px] hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>
            <div className="p-6 space-y-5">
              {inviteError && <div className="text-[12px] font-semibold text-rose-700">{inviteError}</div>}
              {inviteResetUrl && (
                <div className="text-[12px] font-semibold text-emerald-700 break-all">
                  Reset link: {inviteResetUrl}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Email</div>
                  <input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                    placeholder="user@company.com"
                  />
                </div>
                <div>
                  <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Name</div>
                  <input
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                    placeholder="User"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Role</div>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(normalizeRole(e.target.value))}
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                  >
                    <option value="reportee">Reportee</option>
                    <option value="qaOwner">QA Owner</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
                <div className="flex items-end justify-end gap-2">
                  <button
                    type="button"
                    onClick={invite}
                    disabled={inviting}
                    className="h-10 px-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] hover:bg-[#073D44]/90 disabled:opacity-60 transition-colors"
                  >
                    {inviting ? 'Inviting…' : 'Send Invite'}
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Projects</div>
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {projects.map(p => (
                    <label key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white">
                      <input
                        type="checkbox"
                        checked={inviteProjectIds.includes(p.id)}
                        onChange={() => toggleInviteProject(p.id)}
                        className="h-4 w-4 accent-[#073D44]"
                      />
                      <span className="text-[13px] font-semibold text-slate-800 truncate">{p.code}</span>
                    </label>
                  ))}
                  {!projects.length && <div className="text-[13px] text-slate-500 font-semibold">No projects configured.</div>}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementView;
