import React, { useEffect, useMemo, useState } from 'react';
import { PermissionLevel, Role, User, hasPermission } from '../types';
import { fetchWithAuth } from '../services/api';

interface RolesProps {
  user: User;
  token: string;
  onUnauthorized: () => void;
}

type RoleListFilter = 'active' | 'archived' | 'all';

type RoleForm = {
  name: string;
  description: string;
  permissions: {
    dashboard: PermissionLevel;
    userManagement: PermissionLevel;
    roleManagement: PermissionLevel;
  };
};

type ArchivePreviewUser = {
  id: string;
  name: string;
  email: string;
  status: string;
};

const emptyRoleForm: RoleForm = {
  name: '',
  description: '',
  permissions: {
    dashboard: 'edit',
    userManagement: 'edit',
    roleManagement: 'edit',
  },
};

const statusTone = {
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  archived: 'bg-slate-100 text-slate-600 border-slate-200',
};

// Converts checkbox state → PermissionLevel and back
function levelToChecks(level: PermissionLevel) {
  return { view: level === 'view' || level === 'edit', edit: level === 'edit' };
}
function checksToLevel(view: boolean, edit: boolean): PermissionLevel {
  if (edit) return 'edit';
  if (view) return 'view';
  return 'no_access';
}

interface PermissionRowProps {
  label: string;
  value: PermissionLevel;
  onChange: (level: PermissionLevel) => void;
  disabled?: boolean;
}

const PermissionRow: React.FC<PermissionRowProps> = ({ label, value, onChange, disabled = false }) => {
  const { view, edit } = levelToChecks(value);

  const toggleView = () => {
    if (disabled) return;
    // Unchecking view also clears edit
    onChange(checksToLevel(!view, !view ? false : edit));
  };

  const toggleEdit = () => {
    if (disabled) return;
    // Checking edit implies view; unchecking edit keeps view
    const nextEdit = !edit;
    onChange(checksToLevel(nextEdit ? true : view, nextEdit));
  };

  return (
    <div className="flex items-center justify-between gap-4 py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200">
      <span className="text-[13px] font-semibold text-slate-800">{label}</span>
      <div className="flex items-center gap-5">
        <label className={`flex items-center gap-2 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
          <input
            type="checkbox"
            checked={view}
            onChange={toggleView}
            disabled={disabled}
            className="w-4 h-4 rounded border-slate-300 text-[#073D44] accent-[#073D44] cursor-pointer"
          />
          <span className="text-[12px] font-semibold text-slate-600">View</span>
        </label>
        <label className={`flex items-center gap-2 cursor-pointer select-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
          <input
            type="checkbox"
            checked={edit}
            onChange={toggleEdit}
            disabled={disabled}
            className="w-4 h-4 rounded border-slate-300 text-[#073D44] accent-[#073D44] cursor-pointer"
          />
          <span className="text-[12px] font-semibold text-slate-600">Edit</span>
        </label>
      </div>
    </div>
  );
};

const Roles: React.FC<RolesProps> = ({ user, token, onUnauthorized }) => {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [statusFilter, setStatusFilter] = useState<RoleListFilter>('active');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<RoleForm>(emptyRoleForm);
  const [editForm, setEditForm] = useState<RoleForm>(emptyRoleForm);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [archivePreview, setArchivePreview] = useState<ArchivePreviewUser[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  const canView = hasPermission(user, 'roleManagement', 'view');
  const canManage = hasPermission(user, 'roleManagement', 'edit');

  const selectedRole = useMemo(
    () => roles.find(item => item.id === selectedId) || null,
    [roles, selectedId]
  );

  const clearFlash = () => {
    setError('');
    setNotice('');
  };

  const syncEditForm = (role: Role | null) => {
    if (!role) {
      setEditForm(emptyRoleForm);
      setArchivePreview([]);
      return;
    }

    setEditForm({
      name: role.name || '',
      description: role.description || '',
      permissions: {
        dashboard: role.permissions?.dashboard || 'no_access',
        userManagement: role.permissions?.userManagement || 'no_access',
        roleManagement: role.permissions?.roleManagement || 'no_access',
      },
    });
  };

  const fetchRoles = async (filter: RoleListFilter) => {
    const query = filter === 'all' ? '' : `?status=${encodeURIComponent(filter)}`;
    const res = await fetchWithAuth(`/api/roles${query}`, token, {}, onUnauthorized);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data?.error === 'string' ? data.error : 'Unable to load roles');
    return Array.isArray(data?.roles) ? (data.roles as Role[]) : [];
  };

  const reloadRoles = async (preferredId?: string) => {
    const nextRoles = await fetchRoles(statusFilter);
    setRoles(nextRoles);
    setSelectedId(prev => {
      if (preferredId && nextRoles.some(item => item.id === preferredId)) return preferredId;
      if (prev && nextRoles.some(item => item.id === prev)) return prev;
      return nextRoles[0]?.id || '';
    });
  };

  useEffect(() => {
    if (!canView) return;
    let cancelled = false;
    setLoading(true);
    clearFlash();

    (async () => {
      try {
        const nextRoles = await fetchRoles(statusFilter);
        if (cancelled) return;
        setRoles(nextRoles);
        setSelectedId(prev => {
          if (prev && nextRoles.some(item => item.id === prev)) return prev;
          return nextRoles[0]?.id || '';
        });
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load role management');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canView, statusFilter, token]);

  useEffect(() => {
    syncEditForm(selectedRole);
  }, [selectedRole]);

  useEffect(() => {
    if (!selectedRole || selectedRole.status !== 'active') {
      setArchivePreview([]);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);

    (async () => {
      try {
        const res = await fetchWithAuth(`/api/roles/${encodeURIComponent(selectedRole.id)}/archive-preview`, token, {}, onUnauthorized);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (!cancelled) setArchivePreview([]);
          return;
        }
        if (!cancelled) {
          setArchivePreview(Array.isArray(data?.affected_users) ? data.affected_users as ArchivePreviewUser[] : []);
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedRole?.id, selectedRole?.status, token]);

  const handleCreateRole = async () => {
    if (!canManage) return;
    setCreateSaving(true);
    setCreateError('');
    clearFlash();

    try {
      const res = await fetchWithAuth('/api/roles', token, {
        method: 'POST',
        body: JSON.stringify(createForm),
      }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setCreateError(typeof data?.error === 'string' ? data.error : 'Unable to create role');
        return;
      }

      const created = data?.role as Role | undefined;
      if (!created?.id) {
        setCreateError('Unable to create role');
        return;
      }

      setCreateForm(emptyRoleForm);
      setCreateOpen(false);
      setNotice('Role created successfully.');

      if (statusFilter === 'active' || statusFilter === 'all') {
        setRoles(prev => [created, ...prev.filter(item => item.id !== created.id)]);
        setSelectedId(created.id);
      } else {
        await reloadRoles(created.id);
      }
    } catch {
      setCreateError('Unable to create role');
    } finally {
      setCreateSaving(false);
    }
  };

  const handleSaveRole = async () => {
    if (!selectedRole || !canManage || selectedRole.status === 'archived') return;
    setSaving(true);
    clearFlash();

    try {
      const res = await fetchWithAuth(`/api/roles/${encodeURIComponent(selectedRole.id)}`, token, {
        method: 'PATCH',
        body: JSON.stringify(editForm),
      }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Unable to save role');
        return;
      }

      const saved = data?.role as Role | undefined;
      if (!saved?.id) {
        setError('Unable to save role');
        return;
      }

      setRoles(prev => prev.map(item => (item.id === saved.id ? { ...item, ...saved } : item)));
      setNotice('Role updated successfully.');
      syncEditForm(saved);
    } catch {
      setError('Unable to save role');
    } finally {
      setSaving(false);
    }
  };

  const runRoleAction = async (action: 'archive' | 'restore', successMessage: string) => {
    if (!selectedRole || !canManage) return;
    setActing(action);
    clearFlash();

    try {
      const res = await fetchWithAuth(`/api/roles/${encodeURIComponent(selectedRole.id)}/${action}`, token, {
        method: 'POST',
        body: JSON.stringify({}),
      }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : `Unable to ${action} role`);
        return;
      }

      const nextRole = data?.role as Role | undefined;
      if (!nextRole?.id) {
        setError(`Unable to ${action} role`);
        return;
      }

      if (statusFilter !== 'all' && nextRole.status !== statusFilter) {
        await reloadRoles();
      } else {
        setRoles(prev => prev.map(item => (item.id === nextRole.id ? { ...item, ...nextRole } : item)));
      }

      setNotice(successMessage);
    } catch {
      setError(`Unable to ${action} role`);
    } finally {
      setActing(null);
    }
  };

  if (!canView) {
    return (
      <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm p-8">
        <div className="text-[16px] font-bold text-slate-900">Access denied</div>
        <div className="mt-2 text-[13px] text-slate-600 font-semibold">You do not have permission to view role management.</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden">
        <div className="px-6 py-5 bg-[#CFE8E8] border-b border-[#073D44]/15 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[16px] font-extrabold text-[#073D44] tracking-tight">Role Management</div>
            <div className="mt-1 text-[12px] text-[#073D44]/70 font-semibold">Manage dashboard access levels and archived role recovery.</div>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value as RoleListFilter)}
              className="h-10 rounded-xl border border-[#073D44]/15 bg-white px-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
            >
              <option value="active">Active roles</option>
              <option value="archived">Archived roles</option>
              <option value="all">All roles</option>
            </select>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setCreateError('');
                  setCreateForm(emptyRoleForm);
                  setCreateOpen(true);
                }}
                className="h-10 px-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] hover:bg-[#073D44]/90 transition-colors"
              >
                Create Role
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
                <div className="text-[13px] text-slate-500 font-semibold">Loading roles...</div>
              ) : roles.length === 0 ? (
                <div className="text-[13px] text-slate-500 font-semibold">No roles found for this filter.</div>
              ) : (
                roles.map(role => (
                  <button
                    key={role.id}
                    type="button"
                    onClick={() => setSelectedId(role.id)}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                      role.id === selectedId ? 'bg-[#073D44] text-white border-[#073D44]' : 'bg-white text-slate-900 border-slate-200 hover:border-[#407B7E]/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className={`text-[13px] font-bold truncate ${role.id === selectedId ? 'text-white' : 'text-slate-900'}`}>{role.name}</div>
                        <div className={`mt-1 text-[11px] font-semibold truncate ${role.id === selectedId ? 'text-white/75' : 'text-slate-500'}`}>{role.description || 'No description provided'}</div>
                        <div className={`mt-2 text-[11px] font-semibold ${role.id === selectedId ? 'text-white/80' : 'text-slate-600'}`}>
                          {role.user_count || 0} assigned users
                        </div>
                      </div>
                      <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-extrabold uppercase tracking-widest ${role.id === selectedId ? 'bg-white/15 text-white border-white/10' : statusTone[role.status]}`}>
                        {role.status}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="p-6">
            {!selectedRole ? (
              <div className="text-[13px] text-slate-500 font-semibold">Select a role to inspect or edit it.</div>
            ) : (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="text-[20px] font-extrabold text-slate-900 tracking-tight">{selectedRole.name}</div>
                      <div className={`px-2.5 py-1 rounded-lg border text-[10px] font-extrabold uppercase tracking-widest ${statusTone[selectedRole.status]}`}>
                        {selectedRole.status}
                      </div>
                    </div>
                    <div className="mt-2 text-[13px] text-slate-500 font-semibold">{selectedRole.user_count || 0} active assignments</div>
                  </div>
                  {canManage && selectedRole.status === 'active' && (
                    <button
                      type="button"
                      onClick={handleSaveRole}
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
                      <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Role Details</div>
                      <div className="mt-4 space-y-4">
                        <div>
                          <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Role Name</div>
                          <input
                            value={editForm.name}
                            onChange={event => setEditForm(prev => ({ ...prev, name: event.target.value }))}
                            disabled={!canManage || selectedRole.status === 'archived'}
                            className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 disabled:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                          />
                        </div>

                        <div>
                          <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Description</div>
                          <textarea
                            value={editForm.description}
                            onChange={event => setEditForm(prev => ({ ...prev, description: event.target.value }))}
                            disabled={!canManage || selectedRole.status === 'archived'}
                            rows={4}
                            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-[13px] font-semibold text-slate-800 disabled:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20 resize-none"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                      <div className="px-5 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15">
                        <div className="text-[12px] font-extrabold uppercase tracking-widest text-[#073D44]">Module Permissions</div>
                      </div>
                      <div className="p-5 space-y-2">
                        <PermissionRow
                          label="Dashboard"
                          value={editForm.permissions.dashboard}
                          disabled={!canManage || selectedRole.status === 'archived'}
                          onChange={level => setEditForm(prev => ({ ...prev, permissions: { ...prev.permissions, dashboard: level } }))}
                        />
                        <PermissionRow
                          label="Users"
                          value={editForm.permissions.userManagement}
                          disabled={!canManage || selectedRole.status === 'archived'}
                          onChange={level => setEditForm(prev => ({ ...prev, permissions: { ...prev.permissions, userManagement: level } }))}
                        />
                        <PermissionRow
                          label="Roles"
                          value={editForm.permissions.roleManagement}
                          disabled={!canManage || selectedRole.status === 'archived'}
                          onChange={level => setEditForm(prev => ({ ...prev, permissions: { ...prev.permissions, roleManagement: level } }))}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
                      <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Archive Impact</div>
                      {previewLoading ? (
                        <div className="mt-4 text-[13px] text-slate-500 font-semibold">Loading affected users...</div>
                      ) : archivePreview.length === 0 ? (
                        <div className="mt-4 text-[13px] text-slate-500 font-semibold">No active users are currently assigned to this role.</div>
                      ) : (
                        <div className="mt-4 space-y-2">
                          <div className="text-[12px] text-slate-500 font-semibold">These users will keep their data but the role will stop being assignable:</div>
                          {archivePreview.map(item => (
                            <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                              <div className="text-[13px] font-bold text-slate-900 truncate">{item.name}</div>
                              <div className="mt-1 text-[11px] font-semibold text-slate-500 truncate">{item.email}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {canManage && (
                      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
                        <div className="px-5 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15">
                          <div className="text-[12px] font-extrabold uppercase tracking-widest text-[#073D44]">Status Actions</div>
                        </div>
                        <div className="p-5 space-y-3">
                          {selectedRole.status === 'active' ? (
                            <button
                              type="button"
                              onClick={() => runRoleAction('archive', 'Role archived successfully.')}
                              disabled={acting !== null}
                              className="h-10 w-full rounded-xl border border-rose-200 bg-rose-50 text-rose-700 font-semibold text-[13px] disabled:opacity-60 transition-colors"
                            >
                              {acting === 'archive' ? 'Archiving...' : 'Archive Role'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => runRoleAction('restore', 'Role restored successfully.')}
                              disabled={acting !== null}
                              className="h-10 w-full rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold text-[13px] disabled:opacity-60 transition-colors"
                            >
                              {acting === 'restore' ? 'Restoring...' : 'Restore Role'}
                            </button>
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
                <div className="text-[16px] font-extrabold text-[#073D44] tracking-tight">Create Role</div>
                <div className="mt-1 text-[12px] text-[#073D44]/70 font-semibold">Role names must stay globally unique, including archived roles.</div>
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
                <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Role Name</div>
                <input
                  value={createForm.name}
                  onChange={event => setCreateForm(prev => ({ ...prev, name: event.target.value }))}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                  placeholder="Enter role name"
                />
              </div>

              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Description</div>
                <textarea
                  value={createForm.description}
                  onChange={event => setCreateForm(prev => ({ ...prev, description: event.target.value }))}
                  rows={4}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20 resize-none"
                />
              </div>

              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700 mb-3">Module Permissions</div>
                <div className="space-y-2">
                  <PermissionRow
                    label="Dashboard"
                    value={createForm.permissions.dashboard}
                    onChange={level => setCreateForm(prev => ({ ...prev, permissions: { ...prev.permissions, dashboard: level } }))}
                  />
                  <PermissionRow
                    label="Users"
                    value={createForm.permissions.userManagement}
                    onChange={level => setCreateForm(prev => ({ ...prev, permissions: { ...prev.permissions, userManagement: level } }))}
                  />
                  <PermissionRow
                    label="Roles"
                    value={createForm.permissions.roleManagement}
                    onChange={level => setCreateForm(prev => ({ ...prev, permissions: { ...prev.permissions, roleManagement: level } }))}
                  />
                </div>
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
                  onClick={handleCreateRole}
                  disabled={createSaving}
                  className="h-10 px-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] hover:bg-[#073D44]/90 disabled:opacity-60 transition-colors"
                >
                  {createSaving ? 'Creating...' : 'Create Role'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Roles;
