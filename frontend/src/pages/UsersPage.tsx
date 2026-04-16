import React, { useEffect, useMemo, useState } from 'react';
import { Project, Role, User, UserStatus, hasPermission } from '../types';
import { fetchWithAuth } from '../services/api';

interface UsersPageProps {
  user: User;
  projects: Project[];
  token: string;
  onSelfUpdated: (nextUser: User) => void;
  onUnauthorized: () => void;
}

type UserListFilter = 'active' | 'suspended' | 'archived' | 'all';

type CreateUserForm = {
  name: string;
  email: string;
  password: string;
  role_id: string;
};

type EditUserForm = {
  name: string;
  email: string;
  password: string;
  role_id: string;
};

const emptyCreateForm: CreateUserForm = {
  name: '',
  email: '',
  password: '',
  role_id: '',
};

const emptyEditForm: EditUserForm = {
  name: '',
  email: '',
  password: '',
  role_id: '',
};

const statusTone: Record<UserStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  suspended: 'bg-amber-50 text-amber-700 border-amber-200',
  archived: 'bg-slate-100 text-slate-600 border-slate-200',
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Never';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Never';
  return date.toLocaleString();
};

const UsersPage: React.FC<UsersPageProps> = ({ user, projects, token, onSelfUpdated, onUnauthorized }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [statusFilter, setStatusFilter] = useState<UserListFilter>('active');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateUserForm>(emptyCreateForm);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editForm, setEditForm] = useState<EditUserForm>(emptyEditForm);

  const canView = hasPermission(user, 'userManagement', 'view');
  const canManage = hasPermission(user, 'userManagement', 'edit');

  const selectedUser = useMemo(
    () => users.find(item => item.id === selectedId) || null,
    [users, selectedId]
  );

  const activeRoles = useMemo(
    () => roles.filter(role => role.status === 'active'),
    [roles]
  );

  const clearFlash = () => {
    setError('');
    setNotice('');
  };

  const syncEditForm = (target: User | null) => {
    if (!target) {
      setEditForm(emptyEditForm);
      return;
    }
    setEditForm({
      name: target.name || '',
      email: target.email || '',
      password: '',
      role_id: target.role_id || '',
    });
  };

  const fetchRoles = async () => {
    const res = await fetchWithAuth('/api/roles', token, {}, onUnauthorized);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to load roles');
    return Array.isArray(data?.roles) ? (data.roles as Role[]) : [];
  };

  const fetchUsers = async (filter: UserListFilter) => {
    const query = filter === 'all' ? '' : `?status=${encodeURIComponent(filter)}`;
    const res = await fetchWithAuth(`/api/users${query}`, token, {}, onUnauthorized);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to load users');
    return Array.isArray(data?.users) ? (data.users as User[]) : [];
  };

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    setLoading(true);
    clearFlash();

    (async () => {
      try {
        const [nextUsers, nextRoles] = await Promise.all([
          fetchUsers(statusFilter),
          fetchRoles(),
        ]);
        if (cancelled) return;
        setUsers(nextUsers);
        setRoles(nextRoles);
        setSelectedId(prev => {
          if (prev && nextUsers.some(item => item.id === prev)) return prev;
          return nextUsers[0]?.id || '';
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load user management');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canView, statusFilter, token]);

  useEffect(() => {
    syncEditForm(selectedUser);
  }, [selectedUser]);

  const updateUserInState = (nextUser: User) => {
    setUsers(prev => {
      const exists = prev.some(item => item.id === nextUser.id);
      const next = exists
        ? prev.map(item => (item.id === nextUser.id ? nextUser : item))
        : [nextUser, ...prev];
      return next.filter(item => statusFilter === 'all' || item.status === statusFilter);
    });
    if (nextUser.id === user.id) onSelfUpdated(nextUser);
  };

  const reloadCurrentFilter = async (preferredId?: string) => {
    const nextUsers = await fetchUsers(statusFilter);
    setUsers(nextUsers);
    setSelectedId(prev => {
      if (preferredId && nextUsers.some(item => item.id === preferredId)) return preferredId;
      if (prev && nextUsers.some(item => item.id === prev)) return prev;
      return nextUsers[0]?.id || '';
    });
  };

  const handleCreateUser = async () => {
    if (!canManage) return;
    setCreateSaving(true);
    setCreateError('');
    clearFlash();

    try {
      const res = await fetchWithAuth('/api/users', token, {
        method: 'POST',
        body: JSON.stringify({
          name: createForm.name.trim(),
          email: createForm.email.trim().toLowerCase(),
          password: createForm.password,
          role_id: createForm.role_id,
        }),
      }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(typeof data?.error === 'string' ? data.error : 'Unable to create user');
        return;
      }

      const created = data?.user as User | undefined;
      if (!created?.id) {
        setCreateError('Unable to create user');
        return;
      }

      setCreateForm(emptyCreateForm);
      setCreateOpen(false);
      setNotice('User created successfully.');

      if (statusFilter === 'active' || statusFilter === 'all') {
        setUsers(prev => [created, ...prev.filter(item => item.id !== created.id)]);
        setSelectedId(created.id);
      } else {
        await reloadCurrentFilter(created.id);
      }
    } catch {
      setCreateError('Unable to create user');
    } finally {
      setCreateSaving(false);
    }
  };

  const handleSaveUser = async () => {
    if (!selectedUser || !canManage) return;
    setSaving(true);
    clearFlash();

    try {
      const payload: Record<string, string> = {
        name: editForm.name.trim(),
        email: editForm.email.trim().toLowerCase(),
        role_id: editForm.role_id,
      };
      if (editForm.password.trim()) payload.password = editForm.password;

      const res = await fetchWithAuth(`/api/users/${encodeURIComponent(selectedUser.id)}`, token, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Unable to save user');
        return;
      }

      const saved = data?.user as User | undefined;
      if (!saved?.id) {
        setError('Unable to save user');
        return;
      }

      updateUserInState(saved);
      setNotice('User updated successfully.');
      syncEditForm(saved);
    } catch {
      setError('Unable to save user');
    } finally {
      setSaving(false);
    }
  };

  const runStatusAction = async (
    action: 'suspend' | 'reactivate' | 'archive' | 'restore',
    successMessage: string
  ) => {
    if (!selectedUser || !canManage) return;
    setActing(action);
    clearFlash();

    try {
      const res = await fetchWithAuth(`/api/users/${encodeURIComponent(selectedUser.id)}/${action}`, token, {
        method: 'POST',
        body: JSON.stringify({}),
      }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : `Unable to ${action} user`);
        return;
      }

      const nextUser = data?.user as User | undefined;
      if (!nextUser?.id) {
        setError(`Unable to ${action} user`);
        return;
      }

      if (statusFilter !== 'all' && nextUser.status !== statusFilter) {
        await reloadCurrentFilter();
      } else {
        updateUserInState(nextUser);
      }
      setNotice(successMessage);
    } catch {
      setError(`Unable to ${action} user`);
    } finally {
      setActing(null);
    }
  };

  if (!canView) {
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
        <div className="px-6 py-5 bg-[#CFE8E8] border-b border-[#073D44]/15 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[16px] font-extrabold text-[#073D44] tracking-tight">User Management</div>
            <div className="mt-1 text-[12px] text-[#073D44]/70 font-semibold">Create users, assign active roles, and control account state.</div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value as UserListFilter)}
              className="h-10 rounded-xl border border-[#073D44]/15 bg-white px-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
            >
              <option value="active">Active users</option>
              <option value="suspended">Suspended users</option>
              <option value="archived">Archived users</option>
              <option value="all">All users</option>
            </select>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setCreateError('');
                  setCreateForm({
                    ...emptyCreateForm,
                    role_id: activeRoles[0]?.id || '',
                  });
                  setCreateOpen(true);
                }}
                className="h-10 px-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] hover:bg-[#073D44]/90 transition-colors"
              >
                Create User
              </button>
            )}
          </div>
        </div>

        {(error || notice) && (
          <div className={`px-6 py-3 text-[12px] font-semibold border-b ${error ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
            {error || notice}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr]">
          <div className="border-b lg:border-b-0 lg:border-r border-slate-200">
            <div className="p-5 space-y-2">
              {loading ? (
                <div className="text-[13px] text-slate-500 font-semibold">Loading users...</div>
              ) : users.length === 0 ? (
                <div className="text-[13px] text-slate-500 font-semibold">No users found for this filter.</div>
              ) : (
                users.map(item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                      item.id === selectedId ? 'bg-[#073D44] text-white border-[#073D44]' : 'bg-white text-slate-900 border-slate-200 hover:border-[#407B7E]/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className={`text-[13px] font-bold truncate ${item.id === selectedId ? 'text-white' : 'text-slate-900'}`}>{item.name}</div>
                        <div className={`text-[11px] font-semibold truncate ${item.id === selectedId ? 'text-white/75' : 'text-slate-500'}`}>{item.email}</div>
                        <div className={`mt-2 text-[11px] font-semibold truncate ${item.id === selectedId ? 'text-white/80' : 'text-slate-600'}`}>
                          {item.role_name || 'No role assigned'}
                        </div>
                      </div>
                      <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-extrabold uppercase tracking-widest ${item.id === selectedId ? 'bg-white/15 text-white border-white/10' : statusTone[item.status || 'active']}`}>
                        {item.status || 'active'}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="p-6">
            {!selectedUser ? (
              <div className="text-[13px] text-slate-500 font-semibold">Select a user to inspect or edit their account.</div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="text-[20px] font-extrabold text-slate-900 tracking-tight">{selectedUser.name}</div>
                      <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-extrabold uppercase tracking-widest ${statusTone[selectedUser.status || 'active']}`}>
                        {selectedUser.status || 'active'}
                      </div>
                    </div>
                    <div className="mt-2 text-[13px] text-slate-500 font-semibold">{selectedUser.email}</div>
                  </div>
                  {canManage && (
                    <button
                      type="button"
                      onClick={handleSaveUser}
                      disabled={saving}
                      className="h-10 px-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] hover:bg-[#073D44]/90 disabled:opacity-60 transition-colors"
                    >
                      {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-6">
                  <div className="space-y-6">
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                      <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Account Details</div>
                      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Full Name</div>
                          <input
                            value={editForm.name}
                            onChange={event => setEditForm(prev => ({ ...prev, name: event.target.value }))}
                            disabled={!canManage || selectedUser.status === 'archived'}
                            className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 disabled:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                          />
                        </div>
                        <div>
                          <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Email</div>
                          <input
                            value={editForm.email}
                            onChange={event => setEditForm(prev => ({ ...prev, email: event.target.value }))}
                            disabled={!canManage || selectedUser.status === 'archived'}
                            className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 disabled:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                          />
                        </div>
                        <div>
                          <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Assigned Role</div>
                          <select
                            value={editForm.role_id}
                            onChange={event => setEditForm(prev => ({ ...prev, role_id: event.target.value }))}
                            disabled={!canManage || selectedUser.status === 'archived'}
                            className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 disabled:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                          >
                            <option value="">Select a role</option>
                            {activeRoles.map(role => (
                              <option key={role.id} value={role.id}>
                                {role.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Reset Password</div>
                          <input
                            type="password"
                            value={editForm.password}
                            onChange={event => setEditForm(prev => ({ ...prev, password: event.target.value }))}
                            disabled={!canManage || selectedUser.status === 'archived'}
                            placeholder="Leave blank to keep current password"
                            className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 disabled:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                      <div className="px-5 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15">
                        <div className="text-[12px] font-extrabold uppercase tracking-widest text-[#073D44]">Projects</div>
                      </div>
                      <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {projects.map(project => {
                          const assigned = Array.isArray(selectedUser.projects) && selectedUser.projects.includes(project.id);
                          return (
                            <div key={project.id} className={`px-3 py-2 rounded-xl border text-[13px] font-semibold ${assigned ? 'border-[#407B7E]/30 bg-[#CFE8E8]/50 text-[#073D44]' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                              {project.code}
                            </div>
                          );
                        })}
                        {!projects.length && <div className="text-[13px] text-slate-500 font-semibold">No projects configured.</div>}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                      <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Account Timeline</div>
                      <div className="mt-4 space-y-3 text-[13px]">
                        <div>
                          <div className="text-slate-500 font-semibold">Last login</div>
                          <div className="mt-1 text-slate-900 font-bold">{formatDate(selectedUser.last_login_at)}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 font-semibold">Suspended at</div>
                          <div className="mt-1 text-slate-900 font-bold">{formatDate(selectedUser.suspended_at)}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 font-semibold">Archived at</div>
                          <div className="mt-1 text-slate-900 font-bold">{formatDate(selectedUser.archived_at)}</div>
                        </div>
                        <div>
                          <div className="text-slate-500 font-semibold">Created</div>
                          <div className="mt-1 text-slate-900 font-bold">{formatDate(selectedUser.createdAt)}</div>
                        </div>
                      </div>
                    </div>

                    {canManage && (
                      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15">
                          <div className="text-[12px] font-extrabold uppercase tracking-widest text-[#073D44]">Status Actions</div>
                        </div>
                        <div className="p-5 space-y-3">
                          {selectedUser.status === 'active' && (
                            <>
                              <button
                                type="button"
                                onClick={() => runStatusAction('suspend', 'User suspended successfully.')}
                                disabled={acting !== null || selectedUser.id === user.id}
                                className="h-10 w-full rounded-xl border border-amber-200 bg-amber-50 text-amber-700 font-semibold text-[13px] disabled:opacity-60 transition-colors"
                              >
                                {acting === 'suspend' ? 'Suspending...' : 'Suspend User'}
                              </button>
                              <button
                                type="button"
                                onClick={() => runStatusAction('archive', 'User archived successfully.')}
                                disabled={acting !== null || selectedUser.id === user.id}
                                className="h-10 w-full rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-semibold text-[13px] disabled:opacity-60 transition-colors"
                              >
                                {acting === 'archive' ? 'Archiving...' : 'Archive User'}
                              </button>
                            </>
                          )}

                          {selectedUser.status === 'suspended' && (
                            <>
                              <button
                                type="button"
                                onClick={() => runStatusAction('reactivate', 'User reactivated successfully.')}
                                disabled={acting !== null}
                                className="h-10 w-full rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold text-[13px] disabled:opacity-60 transition-colors"
                              >
                                {acting === 'reactivate' ? 'Reactivating...' : 'Reactivate User'}
                              </button>
                              <button
                                type="button"
                                onClick={() => runStatusAction('archive', 'User archived successfully.')}
                                disabled={acting !== null || selectedUser.id === user.id}
                                className="h-10 w-full rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-semibold text-[13px] disabled:opacity-60 transition-colors"
                              >
                                {acting === 'archive' ? 'Archiving...' : 'Archive User'}
                              </button>
                            </>
                          )}

                          {selectedUser.status === 'archived' && (
                            <button
                              type="button"
                              onClick={() => runStatusAction('restore', 'User restored successfully.')}
                              disabled={acting !== null}
                              className="h-10 w-full rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold text-[13px] disabled:opacity-60 transition-colors"
                            >
                              {acting === 'restore' ? 'Restoring...' : 'Restore User'}
                            </button>
                          )}

                          {selectedUser.id === user.id && (
                            <div className="text-[12px] text-slate-500 font-semibold">
                              Your own account cannot be suspended or archived from this screen.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-[20px] shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15 flex items-center justify-between gap-3">
              <div>
                <div className="text-[16px] font-extrabold text-[#073D44] tracking-tight">Create User</div>
                <div className="mt-1 text-[12px] text-[#073D44]/70 font-semibold">Create an active user and assign an active role immediately.</div>
              </div>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-[13px] hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-4">
              {createError && <div className="text-[12px] font-semibold text-rose-700">{createError}</div>}

              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Full Name</div>
                <input
                  value={createForm.name}
                  onChange={event => setCreateForm(prev => ({ ...prev, name: event.target.value }))}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                  placeholder="Enter full name"
                />
              </div>

              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Email</div>
                <input
                  value={createForm.email}
                  onChange={event => setCreateForm(prev => ({ ...prev, email: event.target.value }))}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                  placeholder="name@company.com"
                />
              </div>

              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Temporary Password</div>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={event => setCreateForm(prev => ({ ...prev, password: event.target.value }))}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                  placeholder="Minimum 8 chars, uppercase, number, special char"
                />
              </div>

              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Role</div>
                <select
                  value={createForm.role_id}
                  onChange={event => setCreateForm(prev => ({ ...prev, role_id: event.target.value }))}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                >
                  <option value="">Select an active role</option>
                  {activeRoles.map(role => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-[13px] hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateUser}
                  disabled={createSaving}
                  className="h-10 px-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] hover:bg-[#073D44]/90 disabled:opacity-60 transition-colors"
                >
                  {createSaving ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
