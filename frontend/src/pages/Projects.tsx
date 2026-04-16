import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, hasPermission, ProjectEntity, ProjectStatus, PROJECT_STATUS_TRANSITIONS } from '../types';
import { fetchWithAuth } from '../services/api';

interface ProjectsProps {
  user: User;
  token: string;
  onUnauthorized: () => void;
}

type StatusFilter = ProjectStatus | 'all';

const STATUS_TONE: Record<ProjectStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  on_hold: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-blue-50 text-blue-700 border-blue-200',
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  on_hold: 'On Hold',
  completed: 'Completed',
};

const formatDate = (v: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};

type CreateForm = {
  name: string;
  description: string;
  start_date: string;
  end_date: string;
  tags: string;
};

const emptyCreate: CreateForm = { name: '', description: '', start_date: '', end_date: '', tags: '' };

const Projects: React.FC<ProjectsProps> = ({ user, token, onUnauthorized }) => {
  const navigate = useNavigate();
  const canCreate = hasPermission(user, 'projectManagement', 'edit');
  const canView = hasPermission(user, 'projectManagement', 'view');

  const [projects, setProjects] = useState<ProjectEntity[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const perPage = 20;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreate);
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState('');

  const totalPages = Math.ceil(total / perPage);

  const fetchProjects = async (p = page) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('per_page', String(perPage));
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (showArchived) params.set('archived', 'true');
      const res = await fetchWithAuth(`/api/projects?${params}`, token, {}, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || 'Unable to load projects'); return; }
      setProjects(Array.isArray(data?.projects) ? data.projects : []);
      setTotal(data?.total || 0);
    } catch {
      setError('Unable to load projects');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { setPage(1); }, [statusFilter, showArchived]);
  useEffect(() => { fetchProjects(page); }, [page, statusFilter, showArchived, token]);

  const handleCreate = async () => {
    setCreateSaving(true);
    setCreateError('');
    try {
      const tags = createForm.tags.split(',').map(t => t.trim()).filter(Boolean);
      const body: Record<string, unknown> = {
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        tags,
      };
      if (createForm.start_date) body.start_date = createForm.start_date;
      if (createForm.end_date) body.end_date = createForm.end_date;

      const res = await fetchWithAuth('/api/projects', token, { method: 'POST', body: JSON.stringify(body) }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setCreateError(data?.error || 'Unable to create project'); return; }

      setCreateForm(emptyCreate);
      setCreateOpen(false);
      setNotice('Project created successfully.');
      setStatusFilter('all');
      setShowArchived(false);
      setPage(1);
      setTimeout(() => fetchProjects(1), 100);
    } catch {
      setCreateError('Unable to create project');
    } finally {
      setCreateSaving(false);
    }
  };

  const createDisabled = !createForm.name.trim() || !createForm.description.trim();

  if (!canView && !canCreate) {
    return (
      <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm p-8">
        <div className="text-[16px] font-bold text-slate-900">Access denied</div>
        <div className="mt-2 text-[13px] text-slate-600 font-semibold">You do not have permission to view projects.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden">
        <div className="px-6 py-5 bg-[#CFE8E8] border-b border-[#073D44]/15 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[16px] font-extrabold text-[#073D44] tracking-tight">Projects</div>
            <div className="mt-1 text-[12px] text-[#073D44]/70 font-semibold">Manage QA projects, requirements and modules.</div>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as StatusFilter)}
              className="h-10 rounded-xl border border-[#073D44]/15 bg-white px-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="on_hold">On Hold</option>
              <option value="completed">Completed</option>
            </select>
            <label className="flex items-center gap-2 text-[13px] font-semibold text-slate-700 cursor-pointer">
              <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="h-4 w-4 accent-[#073D44]" />
              Archived
            </label>
            {canCreate && (
              <button
                type="button"
                onClick={() => { setCreateError(''); setCreateForm(emptyCreate); setCreateOpen(true); }}
                className="h-10 px-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] hover:bg-[#073D44]/90 transition-colors"
              >
                Create Project
              </button>
            )}
          </div>
        </div>

        {(error || notice) && (
          <div className={`px-6 py-3 text-[12px] font-semibold border-b ${error ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
            {error || notice}
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['ID', 'Name', 'Status', 'Start', 'End', 'Members', 'REQs', 'Modules', 'TCs'].map(h => (
                  <th key={h} className="px-5 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">{h}</th>
                ))}
                <th className="px-5 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-5 py-8 text-[13px] text-slate-500 font-semibold text-center">Loading projects...</td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-8 text-[13px] text-slate-500 font-semibold text-center">
                    No projects found.
                    {canCreate && (
                      <button type="button" onClick={() => { setCreateError(''); setCreateForm(emptyCreate); setCreateOpen(true); }} className="ml-2 text-[#073D44] underline">Create one</button>
                    )}
                  </td>
                </tr>
              ) : (
                projects.map(p => (
                  <tr
                    key={p.id}
                    className={`border-b border-slate-100 transition-colors hover:bg-slate-50/60 ${p.archived ? 'opacity-60' : ''}`}
                  >
                    <td className="px-5 py-3.5 text-[12px] font-bold text-slate-500">{p.project_id}</td>
                    <td className="px-5 py-3.5">
                      <div className="text-[13px] font-bold text-slate-900 max-w-[220px] truncate">{p.name}</div>
                      {p.tags.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.tags.slice(0, 3).map(t => (
                            <span key={t} className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-semibold text-slate-600">{t}</span>
                          ))}
                          {p.tags.length > 3 && <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[10px] font-semibold text-slate-500">+{p.tags.length - 3}</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {p.archived ? (
                        <span className="px-2.5 py-1 rounded-lg border text-[10px] font-extrabold uppercase tracking-widest bg-slate-100 text-slate-600 border-slate-200">Archived</span>
                      ) : (
                        <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-extrabold uppercase tracking-widest ${STATUS_TONE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-[12px] text-slate-600 font-semibold whitespace-nowrap">{formatDate(p.start_date)}</td>
                    <td className="px-5 py-3.5 text-[12px] text-slate-600 font-semibold whitespace-nowrap">{formatDate(p.end_date)}</td>
                    <td className="px-5 py-3.5 text-[12px] text-slate-700 font-bold text-center">{p.member_count ?? 0}</td>
                    <td className="px-5 py-3.5 text-[12px] text-slate-700 font-bold text-center">{p.req_count}</td>
                    <td className="px-5 py-3.5 text-[12px] text-slate-700 font-bold text-center">{p.module_count}</td>
                    <td className="px-5 py-3.5 text-[12px] text-slate-700 font-bold text-center">{p.tc_count}</td>
                    <td className="px-5 py-3.5">
                      <button
                        type="button"
                        onClick={() => navigate(`/projects/${p.id}`)}
                        className="h-8 px-3 rounded-lg bg-[#073D44] text-white font-semibold text-[12px] hover:bg-[#073D44]/90 transition-colors"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between gap-3">
            <div className="text-[12px] text-slate-500 font-semibold">{total} project{total !== 1 ? 's' : ''}</div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="h-8 px-3 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-700 disabled:opacity-40">Prev</button>
              <span className="text-[12px] font-semibold text-slate-700">{page} / {totalPages}</span>
              <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="h-8 px-3 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-700 disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Create Project Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-[20px] shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15 flex items-center justify-between gap-3">
              <div>
                <div className="text-[16px] font-extrabold text-[#073D44] tracking-tight">Create Project</div>
                <div className="mt-1 text-[12px] text-[#073D44]/70 font-semibold">You will be assigned as Project Manager automatically.</div>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-[13px] hover:bg-slate-50 transition-colors">Close</button>
            </div>
            <div className="p-6 space-y-4">
              {createError && <div className="text-[12px] font-semibold text-rose-700">{createError}</div>}

              <div>
                <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Project Name <span className="text-rose-500">*</span></label>
                <input
                  value={createForm.name}
                  onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                  maxLength={120}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                  placeholder="e.g. Checkout Flow QA"
                />
              </div>

              <div>
                <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Description <span className="text-rose-500">*</span></label>
                <textarea
                  value={createForm.description}
                  onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))}
                  rows={3}
                  maxLength={2000}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20 resize-none"
                  placeholder="What does this project cover?"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Start Date</label>
                  <input
                    type="date"
                    value={createForm.start_date}
                    onChange={e => setCreateForm(f => ({ ...f, start_date: e.target.value }))}
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                  />
                </div>
                <div>
                  <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">End Date</label>
                  <input
                    type="date"
                    value={createForm.end_date}
                    min={createForm.start_date || undefined}
                    onChange={e => setCreateForm(f => ({ ...f, end_date: e.target.value }))}
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                  />
                </div>
              </div>

              <div>
                <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Tags <span className="text-slate-400 font-semibold normal-case tracking-normal">(comma-separated, max 10)</span></label>
                <input
                  value={createForm.tags}
                  onChange={e => setCreateForm(f => ({ ...f, tags: e.target.value }))}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold text-slate-800 focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                  placeholder="e.g. mobile, regression, sprint-4"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-slate-700 font-semibold text-[13px] hover:bg-slate-50 transition-colors">Cancel</button>
                <button type="button" onClick={handleCreate} disabled={createSaving || createDisabled} className="h-10 px-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] hover:bg-[#073D44]/90 disabled:opacity-60 transition-colors">
                  {createSaving ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Projects;
