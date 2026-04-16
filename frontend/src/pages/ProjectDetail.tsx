import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  User, ProjectEntity, ProjectMember, Requirement, ModuleEntity,
  ProjectRole, ProjectStatus, ReqStatus, ReqType, ReqPriority,
  PROJECT_STATUS_TRANSITIONS, REQ_STATUS_TRANSITIONS,
} from '../types';
import { fetchWithAuth } from '../services/api';

interface ProjectDetailProps {
  user: User;
  token: string;
  onUnauthorized: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<ProjectStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  on_hold: 'bg-amber-50 text-amber-700 border-amber-200',
  completed: 'bg-blue-50 text-blue-700 border-blue-200',
};
const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: 'Draft', active: 'Active', on_hold: 'On Hold', completed: 'Completed',
};
const REQ_STATUS_TONE: Record<ReqStatus, string> = {
  draft: 'bg-slate-100 text-slate-600 border-slate-200',
  under_review: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-700 border-rose-200',
};
const REQ_STATUS_LABEL: Record<ReqStatus, string> = {
  draft: 'Draft', under_review: 'Under Review', approved: 'Approved', rejected: 'Rejected',
};
const PRIORITY_TONE: Record<ReqPriority, string> = {
  high: 'bg-rose-50 text-rose-700 border-rose-200',
  medium: 'bg-amber-50 text-amber-700 border-amber-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};
const ROLE_LABEL: Record<ProjectRole, string> = {
  project_manager: 'Project Manager',
  qa_lead: 'QA Lead',
  tester: 'Tester',
};
const ROLE_TONE: Record<ProjectRole, string> = {
  project_manager: 'bg-[#CFE8E8] text-[#073D44] border-[#407B7E]/30',
  qa_lead: 'bg-blue-50 text-blue-700 border-blue-200',
  tester: 'bg-slate-100 text-slate-600 border-slate-200',
};

const fmt = (v: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};

const fmtDt = (v: string | null) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
};

function Badge({ label, tone }: { label: string; tone: string }) {
  return <span className={`px-2.5 py-1 rounded-lg border text-[10px] font-extrabold uppercase tracking-widest ${tone}`}>{label}</span>;
}

type Tab = 'overview' | 'requirements' | 'modules' | 'members';

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  project, members, canEdit, token, onUnauthorized, onUpdated,
}: {
  project: ProjectEntity;
  members: ProjectMember[];
  canEdit: boolean;
  token: string;
  onUnauthorized: () => void;
  onUpdated: (p: ProjectEntity) => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archivePreview, setArchivePreview] = useState<{ req_count: number; module_count: number; tc_count: number } | null>(null);
  const [form, setForm] = useState({ name: '', description: '', start_date: '', end_date: '', tags: '' });
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  const nextStatuses = PROJECT_STATUS_TRANSITIONS[project.status] || [];

  const openEdit = () => {
    setForm({
      name: project.name,
      description: project.description,
      start_date: project.start_date ? project.start_date.slice(0, 10) : '',
      end_date: project.end_date ? project.end_date.slice(0, 10) : '',
      tags: project.tags.join(', '),
    });
    setFormError('');
    setEditOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setFormError('');
    try {
      const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
      const body: Record<string, unknown> = { name: form.name.trim(), description: form.description.trim(), tags };
      if (form.start_date) body.start_date = form.start_date;
      else body.start_date = null;
      if (form.end_date) body.end_date = form.end_date;
      else body.end_date = null;

      const res = await fetchWithAuth(`/api/projects/${project.id}`, token, { method: 'PATCH', body: JSON.stringify(body) }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFormError(data?.error || 'Unable to save'); return; }
      setEditOpen(false);
      onUpdated(data.project);
    } catch {
      setFormError('Unable to save');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: ProjectStatus) => {
    setSaving(true);
    setFormError('');
    try {
      const res = await fetchWithAuth(`/api/projects/${project.id}`, token, { method: 'PATCH', body: JSON.stringify({ status: newStatus }) }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setNotice(''); setFormError(data?.error || 'Unable to update status'); return; }
      onUpdated(data.project);
      setNotice(`Status changed to ${STATUS_LABEL[newStatus]}`);
    } catch {
      setFormError('Unable to update status');
    } finally {
      setSaving(false);
    }
  };

  const openArchive = async () => {
    try {
      const res = await fetchWithAuth(`/api/projects/${project.id}/archive-preview`, token, {}, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      setArchivePreview(res.ok ? data : null);
    } catch { setArchivePreview(null); }
    setArchiveOpen(true);
  };

  const handleArchive = async () => {
    setActing(true);
    try {
      const res = await fetchWithAuth(`/api/projects/${project.id}/archive`, token, { method: 'POST', body: JSON.stringify({}) }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFormError(data?.error || 'Unable to archive'); return; }
      setArchiveOpen(false);
      onUpdated(data.project);
    } catch {
      setFormError('Unable to archive');
    } finally {
      setActing(false);
    }
  };

  const handleRestore = async () => {
    setActing(true);
    try {
      const res = await fetchWithAuth(`/api/projects/${project.id}/restore`, token, { method: 'POST', body: JSON.stringify({}) }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFormError(data?.error || 'Unable to restore'); return; }
      onUpdated(data.project);
    } catch {
      setFormError('Unable to restore');
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="space-y-6">
      {(formError || notice) && (
        <div className={`text-[12px] font-semibold px-4 py-3 rounded-xl border ${formError ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
          {formError || notice}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-5">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Project Details</div>
              {canEdit && !project.archived && (
                <button type="button" onClick={openEdit} className="h-8 px-3 rounded-lg border border-slate-200 bg-white text-[12px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors">Edit</button>
              )}
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-[13px]">
              <div>
                <div className="text-slate-500 font-semibold">Description</div>
                <div className="mt-1 text-slate-900 font-semibold whitespace-pre-wrap">{project.description}</div>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-slate-500 font-semibold">Start Date</div>
                  <div className="mt-1 text-slate-900 font-bold">{fmt(project.start_date)}</div>
                </div>
                <div>
                  <div className="text-slate-500 font-semibold">End Date</div>
                  <div className="mt-1 text-slate-900 font-bold">{fmt(project.end_date)}</div>
                </div>
                {project.tags.length > 0 && (
                  <div>
                    <div className="text-slate-500 font-semibold">Tags</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {project.tags.map(t => (
                        <span key={t} className="px-2 py-0.5 rounded-md bg-slate-200 text-[11px] font-semibold text-slate-700">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Counters</div>
            <div className="mt-4 grid grid-cols-3 gap-4">
              {[
                { label: 'Requirements', value: project.req_count },
                { label: 'Modules', value: project.module_count },
                { label: 'Test Cases', value: project.tc_count },
              ].map(c => (
                <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4 text-center">
                  <div className="text-[28px] font-extrabold text-[#073D44]">{c.value}</div>
                  <div className="mt-1 text-[11px] font-semibold text-slate-500 uppercase tracking-widest">{c.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15">
              <div className="text-[12px] font-extrabold uppercase tracking-widest text-[#073D44]">Status</div>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                <Badge label={project.archived ? 'Archived' : STATUS_LABEL[project.status]} tone={project.archived ? 'bg-slate-100 text-slate-600 border-slate-200' : STATUS_TONE[project.status]} />
              </div>
              {canEdit && !project.archived && nextStatuses.length > 0 && (
                <div className="space-y-2">
                  <div className="text-[11px] font-extrabold uppercase tracking-widest text-slate-500">Transition to</div>
                  {nextStatuses.map(s => (
                    <button key={s} type="button" onClick={() => handleStatusChange(s)} disabled={saving}
                      className="w-full h-9 rounded-xl border border-slate-200 bg-white text-[12px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors">
                      {STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              )}
              {canEdit && !project.archived && (
                <button type="button" onClick={openArchive} disabled={acting}
                  className="w-full h-9 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-[12px] font-semibold disabled:opacity-60 transition-colors">
                  Archive Project
                </button>
              )}
              {canEdit && project.archived && (
                <button type="button" onClick={handleRestore} disabled={acting}
                  className="w-full h-9 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-[12px] font-semibold disabled:opacity-60 transition-colors">
                  {acting ? 'Restoring...' : 'Restore Project'}
                </button>
              )}
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
            <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Timeline</div>
            <div className="mt-4 space-y-3 text-[13px]">
              <div>
                <div className="text-slate-500 font-semibold">Created</div>
                <div className="mt-1 text-slate-900 font-bold">{fmtDt(project.createdAt)}</div>
              </div>
              <div>
                <div className="text-slate-500 font-semibold">Last updated</div>
                <div className="mt-1 text-slate-900 font-bold">{fmtDt(project.updatedAt)}</div>
              </div>
              {project.archived_at && (
                <div>
                  <div className="text-slate-500 font-semibold">Archived</div>
                  <div className="mt-1 text-slate-900 font-bold">{fmtDt(project.archived_at)}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-[20px] shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15 flex items-center justify-between">
              <div className="text-[16px] font-extrabold text-[#073D44]">Edit Project</div>
              <button type="button" onClick={() => setEditOpen(false)} className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50">Close</button>
            </div>
            <div className="p-6 space-y-4">
              {formError && <div className="text-[12px] font-semibold text-rose-700">{formError}</div>}
              <div>
                <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Name <span className="text-rose-500">*</span></label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} maxLength={120}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20" />
              </div>
              <div>
                <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Description <span className="text-rose-500">*</span></label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} maxLength={2000}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-semibold resize-none focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20" />
                </div>
                <div>
                  <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">End Date</label>
                  <input type="date" value={form.end_date} min={form.start_date || undefined} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20" />
                </div>
              </div>
              <div>
                <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Tags</label>
                <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                  placeholder="comma-separated" />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setEditOpen(false)} className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={handleSave} disabled={saving || !form.name.trim() || !form.description.trim()}
                  className="h-10 px-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] hover:bg-[#073D44]/90 disabled:opacity-60">
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirm Modal */}
      {archiveOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-[20px] shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-100">
              <div className="text-[16px] font-extrabold text-rose-700">Archive Project?</div>
            </div>
            <div className="p-6 space-y-4">
              {archivePreview && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-[13px]">
                  <div className="font-extrabold text-slate-700 text-[11px] uppercase tracking-widest">Impact</div>
                  <div className="flex gap-6">
                    <div><span className="font-bold text-slate-900">{archivePreview.req_count}</span> <span className="text-slate-500 font-semibold">REQs</span></div>
                    <div><span className="font-bold text-slate-900">{archivePreview.module_count}</span> <span className="text-slate-500 font-semibold">Modules</span></div>
                    <div><span className="font-bold text-slate-900">{archivePreview.tc_count}</span> <span className="text-slate-500 font-semibold">TCs</span></div>
                  </div>
                  <div className="text-[12px] text-slate-500 font-semibold">These remain accessible but no new writes will be allowed.</div>
                </div>
              )}
              <div className="text-[13px] text-slate-700 font-semibold">This project will be hidden from lists and marked as archived. It can be restored later.</div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setArchiveOpen(false)} className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                <button type="button" onClick={handleArchive} disabled={acting}
                  className="h-10 px-4 rounded-xl bg-rose-600 text-white font-semibold text-[13px] hover:bg-rose-700 disabled:opacity-60">
                  {acting ? 'Archiving...' : 'Archive Project'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Requirements Tab ─────────────────────────────────────────────────────────

function RequirementsTab({
  project, user, token, onUnauthorized,
}: {
  project: ProjectEntity;
  user: User;
  token: string;
  onUnauthorized: () => void;
}) {
  const [reqs, setReqs] = useState<Requirement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const perPage = 50;
  const [statusFilter, setStatusFilter] = useState<ReqStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ title: '', description: '', type: 'functional' as ReqType, priority: 'medium' as ReqPriority });
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState('');

  const [selected, setSelected] = useState<Requirement | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [acting, setActing] = useState(false);

  const canWrite = !project.archived;
  const approvedCount = reqs.filter(r => r.status === 'approved' && !r.archived).length;
  const totalPages = Math.ceil(total / perPage);

  const fetchReqs = useCallback(async (p = 1) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(p), per_page: String(perPage) });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (showArchived) params.set('archived', 'true');
      const res = await fetchWithAuth(`/api/projects/${project.id}/requirements?${params}`, token, {}, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || 'Unable to load requirements'); return; }
      setReqs(Array.isArray(data?.requirements) ? data.requirements : []);
      setTotal(data?.total || 0);
    } catch { setError('Unable to load requirements'); }
    finally { setLoading(false); }
  }, [project.id, token, statusFilter, priorityFilter, typeFilter, showArchived]);

  useEffect(() => { setPage(1); }, [statusFilter, priorityFilter, typeFilter, showArchived]);
  useEffect(() => { fetchReqs(page); }, [page, fetchReqs]);

  const handleCreate = async () => {
    setCreateSaving(true);
    setCreateError('');
    try {
      const res = await fetchWithAuth(`/api/projects/${project.id}/requirements`, token, {
        method: 'POST', body: JSON.stringify(createForm),
      }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setCreateError(data?.error || 'Unable to create requirement'); return; }
      setCreateForm({ title: '', description: '', type: 'functional', priority: 'medium' });
      setCreateOpen(false);
      setNotice(`${data.requirement.req_id} created.`);
      fetchReqs(1);
    } catch { setCreateError('Unable to create requirement'); }
    finally { setCreateSaving(false); }
  };

  const handleTransition = async (req: Requirement, newStatus: ReqStatus) => {
    setTransitioning(true);
    try {
      const res = await fetchWithAuth(`/api/projects/${project.id}/requirements/${req.id}`, token, {
        method: 'PATCH', body: JSON.stringify({ status: newStatus }),
      }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || 'Unable to update status'); return; }
      setReqs(prev => prev.map(r => r.id === req.id ? data.requirement : r));
      if (selected?.id === req.id) setSelected(data.requirement);
      setNotice(`${req.req_id} → ${REQ_STATUS_LABEL[newStatus]}`);
    } catch { setError('Unable to update status'); }
    finally { setTransitioning(false); }
  };

  const handleArchiveReq = async () => {
    if (!selected) return;
    setActing(true);
    try {
      const res = await fetchWithAuth(`/api/projects/${project.id}/requirements/${selected.id}/archive`, token, { method: 'POST', body: '{}' }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || 'Unable to archive'); return; }
      setArchiveConfirmOpen(false);
      setDetailOpen(false);
      setSelected(null);
      setNotice(`${selected.req_id} archived.`);
      fetchReqs(page);
    } catch { setError('Unable to archive'); }
    finally { setActing(false); }
  };

  const openDetail = (req: Requirement) => { setSelected(req); setDetailOpen(true); };

  const tcGateBanner = approvedCount === 0 && !showArchived && (
    <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-[12px] font-semibold text-amber-700">
      <span>⚠</span>
      <span>No approved requirements — TC creation is blocked for all modules in this project.</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {tcGateBanner}

      {(error || notice) && (
        <div className={`text-[12px] font-semibold px-4 py-3 rounded-xl border ${error ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
          {error || notice}
        </div>
      )}

      {/* Filters + actions */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          {(['all', 'draft', 'under_review', 'approved', 'rejected'] as const).map(s => (
            <button key={s} type="button" onClick={() => setStatusFilter(s)}
              className={`h-8 px-3 rounded-lg text-[12px] font-semibold border transition-colors ${statusFilter === s ? 'bg-[#073D44] text-white border-[#073D44]' : 'bg-white text-slate-600 border-slate-200 hover:border-[#407B7E]/40'}`}>
              {s === 'all' ? 'All' : REQ_STATUS_LABEL[s]}
            </button>
          ))}
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
            className="h-8 rounded-lg border border-slate-200 px-2 text-[12px] font-semibold text-slate-700 focus:outline-none">
            <option value="all">All Priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="h-8 rounded-lg border border-slate-200 px-2 text-[12px] font-semibold text-slate-700 focus:outline-none">
            <option value="all">All Types</option>
            <option value="functional">Functional</option>
            <option value="non_functional">Non-Functional</option>
            <option value="ui">UI</option>
            <option value="performance">Performance</option>
          </select>
          <label className="flex items-center gap-2 text-[12px] font-semibold text-slate-600 cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="h-4 w-4 accent-[#073D44]" />
            Archived
          </label>
        </div>
        {canWrite && (
          <button type="button" onClick={() => { setCreateError(''); setCreateOpen(true); }}
            className="h-9 px-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] hover:bg-[#073D44]/90 transition-colors">
            Add Requirement
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {['REQ ID', 'Title', 'Type', 'Priority', 'Status', 'Coverage', 'Updated', ''].map(h => (
                <th key={h} className="px-4 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-[13px] text-slate-500 font-semibold text-center">Loading...</td></tr>
            ) : reqs.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-[13px] text-slate-500 font-semibold text-center">No requirements found.</td></tr>
            ) : (
              reqs.map(r => (
                <tr key={r.id} className={`border-b border-slate-100 hover:bg-slate-50/60 cursor-pointer ${r.archived ? 'opacity-60' : ''}`} onClick={() => openDetail(r)}>
                  <td className="px-4 py-3 text-[12px] font-bold text-slate-500 whitespace-nowrap">{r.req_id}</td>
                  <td className="px-4 py-3 text-[13px] font-semibold text-slate-900 max-w-[240px] truncate">{r.title}</td>
                  <td className="px-4 py-3"><span className="text-[11px] font-semibold text-slate-600">{r.type.replace('_', ' ')}</span></td>
                  <td className="px-4 py-3"><Badge label={r.priority} tone={PRIORITY_TONE[r.priority]} /></td>
                  <td className="px-4 py-3"><Badge label={REQ_STATUS_LABEL[r.status]} tone={REQ_STATUS_TONE[r.status]} /></td>
                  <td className="px-4 py-3 text-[12px] font-bold text-slate-700 text-center">{r.coverage}</td>
                  <td className="px-4 py-3 text-[11px] text-slate-500 font-semibold whitespace-nowrap">{fmtDt(r.updatedAt)}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    {canWrite && !r.archived && (
                      <button type="button" onClick={() => { setSelected(r); setArchiveConfirmOpen(true); }}
                        className="h-7 px-2.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-[11px] font-semibold hover:bg-rose-100 transition-colors">
                        Archive
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-200 flex justify-between items-center">
            <span className="text-[12px] text-slate-500 font-semibold">{total} requirements</span>
            <div className="flex gap-2 items-center">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="h-8 px-3 rounded-lg border border-slate-200 text-[12px] font-semibold disabled:opacity-40">Prev</button>
              <span className="text-[12px] font-semibold text-slate-700">{page}/{totalPages}</span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="h-8 px-3 rounded-lg border border-slate-200 text-[12px] font-semibold disabled:opacity-40">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Create REQ Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-[20px] shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15 flex items-center justify-between">
              <div className="text-[16px] font-extrabold text-[#073D44]">Add Requirement</div>
              <button type="button" onClick={() => setCreateOpen(false)} className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700">Close</button>
            </div>
            <div className="p-6 space-y-4">
              {createError && <div className="text-[12px] font-semibold text-rose-700">{createError}</div>}
              <div>
                <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Title <span className="text-rose-500">*</span></label>
                <input value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} maxLength={300}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20"
                  placeholder="User can reset password via email" />
              </div>
              <div>
                <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Description <span className="text-rose-500">*</span></label>
                <textarea value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} rows={3} maxLength={5000}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-semibold resize-none focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Type <span className="text-rose-500">*</span></label>
                  <select value={createForm.type} onChange={e => setCreateForm(f => ({ ...f, type: e.target.value as ReqType }))}
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold focus:outline-none">
                    <option value="functional">Functional</option>
                    <option value="non_functional">Non-Functional</option>
                    <option value="ui">UI</option>
                    <option value="performance">Performance</option>
                  </select>
                </div>
                <div>
                  <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Priority <span className="text-rose-500">*</span></label>
                  <select value={createForm.priority} onChange={e => setCreateForm(f => ({ ...f, priority: e.target.value as ReqPriority }))}
                    className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold focus:outline-none">
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700">Cancel</button>
                <button type="button" onClick={handleCreate} disabled={createSaving || !createForm.title.trim() || !createForm.description.trim()}
                  className="h-10 px-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] disabled:opacity-60">
                  {createSaving ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REQ Detail Drawer */}
      {detailOpen && selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-xl bg-white rounded-[20px] shadow-xl border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15 flex items-center justify-between shrink-0">
              <div>
                <div className="text-[14px] font-extrabold text-[#073D44]">{selected.req_id}</div>
                <div className="mt-0.5 text-[12px] text-[#073D44]/70 font-semibold truncate">{selected.title}</div>
              </div>
              <button type="button" onClick={() => setDetailOpen(false)} className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700">Close</button>
            </div>
            <div className="p-6 overflow-y-auto space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge label={REQ_STATUS_LABEL[selected.status]} tone={REQ_STATUS_TONE[selected.status]} />
                <Badge label={selected.priority} tone={PRIORITY_TONE[selected.priority]} />
                <Badge label={selected.type.replace('_', ' ')} tone="bg-slate-100 text-slate-600 border-slate-200" />
                {selected.archived && <Badge label="Archived" tone="bg-slate-100 text-slate-600 border-slate-200" />}
              </div>

              <div>
                <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Description</div>
                <div className="mt-2 text-[13px] text-slate-700 font-semibold whitespace-pre-wrap">{selected.description}</div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-[13px]">
                <div><div className="text-slate-500 font-semibold">Coverage (TCs)</div><div className="mt-1 font-bold text-slate-900">{selected.coverage}</div></div>
                <div><div className="text-slate-500 font-semibold">Created</div><div className="mt-1 font-bold text-slate-900">{fmtDt(selected.createdAt)}</div></div>
              </div>

              {/* Status transitions */}
              {canWrite && !selected.archived && (() => {
                const next = REQ_STATUS_TRANSITIONS[selected.status] || [];
                if (!next.length) return null;
                return (
                  <div>
                    <div className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700 mb-2">Status Actions</div>
                    <div className="flex flex-wrap gap-2">
                      {next.map(s => (
                        <button key={s} type="button" disabled={transitioning} onClick={() => handleTransition(selected, s)}
                          className={`h-9 px-4 rounded-xl border text-[12px] font-semibold transition-colors disabled:opacity-60 ${s === 'approved' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : s === 'rejected' ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}>
                          {REQ_STATUS_LABEL[s]}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Archive REQ Confirm */}
      {archiveConfirmOpen && selected && (
        <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-[20px] shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="text-[16px] font-extrabold text-slate-900">Archive {selected.req_id}?</div>
            <div className="text-[13px] text-slate-600 font-semibold">This requirement has <strong>{selected.coverage}</strong> linked TC(s). It will be hidden from module pickers after archiving.</div>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setArchiveConfirmOpen(false)} className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={handleArchiveReq} disabled={acting} className="h-10 px-4 rounded-xl bg-rose-600 text-white font-semibold text-[13px] disabled:opacity-60">
                {acting ? 'Archiving...' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Modules Tab ──────────────────────────────────────────────────────────────

function ModulesTab({
  project, user, token, onUnauthorized,
}: {
  project: ProjectEntity;
  user: User;
  token: string;
  onUnauthorized: () => void;
}) {
  const [modules, setModules] = useState<(ModuleEntity & { sub_modules: ModuleEntity[] })[]>([]);
  const [approvedReqs, setApprovedReqs] = useState<Requirement[]>([]);
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [createParentId, setCreateParentId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ name: '', description: '', linked_req_ids: [] as string[] });
  const [createSaving, setCreateSaving] = useState(false);
  const [createError, setCreateError] = useState('');
  const [archiveTarget, setArchiveTarget] = useState<ModuleEntity | null>(null);
  const [archivePreview, setArchivePreview] = useState<{ tc_count: number; sub_module_count: number } | null>(null);
  const [acting, setActing] = useState(false);

  const canWrite = !project.archived;
  const hasApprovedReqs = approvedReqs.length > 0;

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (showArchived) params.set('archived', 'true');
      const [modRes, reqRes] = await Promise.all([
        fetchWithAuth(`/api/projects/${project.id}/modules?${params}`, token, {}, onUnauthorized),
        fetchWithAuth(`/api/projects/${project.id}/modules/approved-reqs`, token, {}, onUnauthorized),
      ]);
      const [modData, reqData] = await Promise.all([modRes.json().catch(() => ({})), reqRes.json().catch(() => ({}))]);
      if (!modRes.ok) { setError(modData?.error || 'Unable to load modules'); return; }
      setModules(Array.isArray(modData?.modules) ? modData.modules : []);
      setApprovedReqs(Array.isArray(reqData?.requirements) ? reqData.requirements : []);
    } catch { setError('Unable to load modules'); }
    finally { setLoading(false); }
  }, [project.id, token, showArchived]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const openCreate = (parentId: string | null = null) => {
    setCreateParentId(parentId);
    setCreateForm({ name: '', description: '', linked_req_ids: [] });
    setCreateError('');
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    setCreateSaving(true);
    setCreateError('');
    try {
      const body: Record<string, unknown> = {
        name: createForm.name.trim(),
        description: createForm.description.trim(),
        linked_req_ids: createForm.linked_req_ids,
      };
      if (createParentId) body.parent_module_id = createParentId;
      const res = await fetchWithAuth(`/api/projects/${project.id}/modules`, token, { method: 'POST', body: JSON.stringify(body) }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setCreateError(data?.error || 'Unable to create module'); return; }
      setCreateOpen(false);
      setNotice('Module created.');
      fetchAll();
    } catch { setCreateError('Unable to create module'); }
    finally { setCreateSaving(false); }
  };

  const openArchive = async (mod: ModuleEntity) => {
    setArchiveTarget(mod);
    try {
      const res = await fetchWithAuth(`/api/projects/${project.id}/modules/${mod.id}/archive-preview`, token, {}, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      setArchivePreview(res.ok ? data : null);
    } catch { setArchivePreview(null); }
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setActing(true);
    try {
      const res = await fetchWithAuth(`/api/projects/${project.id}/modules/${archiveTarget.id}/archive`, token, { method: 'POST', body: '{}' }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || 'Unable to archive module'); return; }
      setArchiveTarget(null);
      setNotice('Module archived.');
      fetchAll();
    } catch { setError('Unable to archive'); }
    finally { setActing(false); }
  };

  const toggleReqLink = (id: string) => {
    setCreateForm(f => ({
      ...f,
      linked_req_ids: f.linked_req_ids.includes(id)
        ? f.linked_req_ids.filter(r => r !== id)
        : [...f.linked_req_ids, id],
    }));
  };

  const createDisabled = !createForm.name.trim() || createForm.linked_req_ids.length === 0;

  const renderModule = (mod: ModuleEntity & { sub_modules?: ModuleEntity[] }, isRoot: boolean) => (
    <div key={mod.id} className={`${isRoot ? '' : 'ml-6 mt-2'} bg-white border border-slate-200 rounded-2xl p-4`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-bold text-slate-900">{mod.name}</span>
            {mod.archived && <Badge label="Archived" tone="bg-slate-100 text-slate-600 border-slate-200" />}
          </div>
          {mod.description && <div className="mt-1 text-[12px] text-slate-500 font-semibold">{mod.description}</div>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(mod.linked_req_ids as string[]).map((rid: string) => {
              const req = approvedReqs.find(r => r.id === rid);
              return (
                <span key={rid} className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${req ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                  {req ? req.req_id : rid.slice(-6)}
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-center">
            <div className="text-[18px] font-extrabold text-[#073D44]">{mod.tc_count.total}</div>
            <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest">TCs</div>
          </div>
          {mod.tc_count.total > 0 && (
            <div className="flex gap-1 text-[10px] font-bold">
              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{mod.tc_count.pass}P</span>
              <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">{mod.tc_count.fail}F</span>
              <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{mod.tc_count.pending}N</span>
            </div>
          )}
          {canWrite && !mod.archived && (
            <>
              {isRoot && (
                <button type="button" onClick={() => openCreate(mod.id)}
                  className="h-8 px-3 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-700 hover:bg-slate-50">
                  + Sub-module
                </button>
              )}
              <button type="button" onClick={() => openArchive(mod)}
                className="h-8 px-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-[12px] font-semibold hover:bg-rose-100">
                Archive
              </button>
            </>
          )}
        </div>
      </div>
      {isRoot && mod.sub_modules && mod.sub_modules.length > 0 && (
        <div className="mt-3 space-y-2">
          {mod.sub_modules.map(sub => renderModule(sub, false))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {(error || notice) && (
        <div className={`text-[12px] font-semibold px-4 py-3 rounded-xl border ${error ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
          {error || notice}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-[12px] font-semibold text-slate-600 cursor-pointer">
          <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} className="h-4 w-4 accent-[#073D44]" />
          Show archived
        </label>
        {canWrite && (
          <button type="button" onClick={() => openCreate(null)} disabled={!hasApprovedReqs}
            title={!hasApprovedReqs ? 'Approve at least one requirement first' : undefined}
            className="h-9 px-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] hover:bg-[#073D44]/90 disabled:opacity-50 transition-colors">
            Create Module
          </button>
        )}
      </div>

      {!hasApprovedReqs && canWrite && (
        <div className="flex items-start gap-3 px-4 py-3 rounded-xl border border-amber-200 bg-amber-50 text-[12px] font-semibold text-amber-700">
          <span>⚠</span>
          <span>No approved requirements — approve at least one requirement before creating modules.</span>
        </div>
      )}

      {loading ? (
        <div className="text-[13px] text-slate-500 font-semibold py-4">Loading modules...</div>
      ) : modules.length === 0 ? (
        <div className="text-[13px] text-slate-500 font-semibold py-4">No modules found.</div>
      ) : (
        <div className="space-y-3">
          {modules.map(m => renderModule(m, true))}
        </div>
      )}

      {/* Create Module Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white rounded-[20px] shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15 flex items-center justify-between">
              <div>
                <div className="text-[16px] font-extrabold text-[#073D44]">{createParentId ? 'Create Sub-module' : 'Create Module'}</div>
                <div className="mt-1 text-[12px] text-[#073D44]/70 font-semibold">Link at least one approved requirement.</div>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700">Close</button>
            </div>
            <div className="p-6 space-y-4">
              {createError && <div className="text-[12px] font-semibold text-rose-700">{createError}</div>}
              <div>
                <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Name <span className="text-rose-500">*</span></label>
                <input value={createForm.name} onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))} maxLength={200}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20" />
              </div>
              <div>
                <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Description</label>
                <textarea value={createForm.description} onChange={e => setCreateForm(f => ({ ...f, description: e.target.value }))} rows={2} maxLength={2000}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-semibold resize-none focus:outline-none focus:ring-4 focus:ring-[#407B7E]/20" />
              </div>
              <div>
                <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">
                  Linked Requirements <span className="text-rose-500">*</span>
                  <span className="ml-2 text-slate-400 font-semibold normal-case tracking-normal">(approved only)</span>
                </label>
                {approvedReqs.length === 0 ? (
                  <div className="mt-2 text-[12px] text-amber-700 font-semibold">No approved requirements available.</div>
                ) : (
                  <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
                    {approvedReqs.map(r => (
                      <label key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer hover:border-[#407B7E]/40">
                        <input type="checkbox" checked={createForm.linked_req_ids.includes(r.id)} onChange={() => toggleReqLink(r.id)} className="h-4 w-4 accent-[#073D44]" />
                        <span className="text-[11px] font-bold text-slate-500 w-16 shrink-0">{r.req_id}</span>
                        <span className="text-[12px] font-semibold text-slate-800 truncate">{r.title}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700">Cancel</button>
                <button type="button" onClick={handleCreate} disabled={createSaving || createDisabled}
                  className="h-10 px-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] disabled:opacity-60">
                  {createSaving ? 'Creating...' : 'Create Module'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Archive Module Confirm */}
      {archiveTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white rounded-[20px] shadow-xl border border-slate-200 p-6 space-y-4">
            <div className="text-[16px] font-extrabold text-slate-900">Archive "{archiveTarget.name}"?</div>
            {archivePreview && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1 text-[13px]">
                <div className="flex gap-6">
                  <div><span className="font-bold text-slate-900">{archivePreview.tc_count}</span> <span className="text-slate-500 font-semibold">TCs</span></div>
                  <div><span className="font-bold text-slate-900">{archivePreview.sub_module_count}</span> <span className="text-slate-500 font-semibold">Sub-modules</span></div>
                </div>
                {archivePreview.sub_module_count > 0 && (
                  <div className="text-[12px] text-amber-700 font-semibold">Sub-modules will also be archived.</div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setArchiveTarget(null)} className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700">Cancel</button>
              <button type="button" onClick={handleArchive} disabled={acting} className="h-10 px-4 rounded-xl bg-rose-600 text-white font-semibold text-[13px] disabled:opacity-60">
                {acting ? 'Archiving...' : 'Archive'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Members Tab ──────────────────────────────────────────────────────────────

function MembersTab({
  project, members, currentUser, token, onUnauthorized, onMembersChanged,
}: {
  project: ProjectEntity;
  members: ProjectMember[];
  currentUser: User;
  token: string;
  onUnauthorized: () => void;
  onMembersChanged: (m: ProjectMember[]) => void;
}) {
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ user_id: '', project_role: 'tester' as ProjectRole });
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState('');
  const [acting, setActing] = useState<string | null>(null);
  const [error, setError] = useState('');

  const canManage = !project.archived;
  const memberIds = useMemo(() => new Set(members.map(m => m.user_id)), [members]);

  // Determine if current user is a PM in this project (or system admin)
  const isManagerUser = currentUser.role === 'manager';
  const myMembership = members.find(m => m.user_id === currentUser.id);
  const canAddMembers = canManage && (isManagerUser || myMembership?.project_role === 'project_manager');

  useEffect(() => {
    if (!addOpen) return;
    (async () => {
      try {
        const res = await fetchWithAuth('/api/users?status=active', token, {}, onUnauthorized);
        const data = await res.json().catch(() => ({}));
        setAllUsers(Array.isArray(data?.users) ? data.users : []);
      } catch { setAllUsers([]); }
    })();
  }, [addOpen, token]);

  const availableUsers = useMemo(() => allUsers.filter(u => !memberIds.has(u.id)), [allUsers, memberIds]);

  const handleAdd = async () => {
    setAddSaving(true);
    setAddError('');
    try {
      const res = await fetchWithAuth(`/api/projects/${project.id}/members`, token, {
        method: 'POST', body: JSON.stringify(addForm),
      }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setAddError(data?.error || 'Unable to add member'); return; }
      setAddOpen(false);
      onMembersChanged([...members, data.member]);
    } catch { setAddError('Unable to add member'); }
    finally { setAddSaving(false); }
  };

  const handleRoleChange = async (userId: string, newRole: ProjectRole) => {
    setActing(userId);
    setError('');
    try {
      const res = await fetchWithAuth(`/api/projects/${project.id}/members/${userId}`, token, {
        method: 'PATCH', body: JSON.stringify({ project_role: newRole }),
      }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || 'Unable to update role'); return; }
      onMembersChanged(members.map(m => m.user_id === userId ? data.member : m));
    } catch { setError('Unable to update role'); }
    finally { setActing(null); }
  };

  const handleRemove = async (userId: string) => {
    setActing(userId);
    setError('');
    try {
      const res = await fetchWithAuth(`/api/projects/${project.id}/members/${userId}`, token, { method: 'DELETE' }, onUnauthorized);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data?.error || 'Unable to remove member'); return; }
      onMembersChanged(members.filter(m => m.user_id !== userId));
    } catch { setError('Unable to remove member'); }
    finally { setActing(null); }
  };

  const pmCount = members.filter(m => m.project_role === 'project_manager').length;

  return (
    <div className="space-y-4">
      {error && <div className="text-[12px] font-semibold px-4 py-3 rounded-xl border bg-rose-50 text-rose-700 border-rose-100">{error}</div>}

      <div className="flex justify-between items-center">
        <div className="text-[13px] text-slate-600 font-semibold">{members.length} active member{members.length !== 1 ? 's' : ''}</div>
        {canAddMembers && (
          <button type="button" onClick={() => { setAddError(''); setAddForm({ user_id: '', project_role: 'tester' }); setAddOpen(true); }}
            className="h-9 px-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] hover:bg-[#073D44]/90 transition-colors">
            Add Member
          </button>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              {['Member', 'Email', 'Project Role', 'Assigned', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-[11px] font-extrabold uppercase tracking-widest text-slate-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-[13px] text-slate-500 font-semibold text-center">No members.</td></tr>
            ) : (
              members.map(m => {
                const isMe = m.user_id === currentUser.id;
                const isLastPM = m.project_role === 'project_manager' && pmCount <= 1;
                const canAct = canAddMembers && !isMe && !isLastPM;

                return (
                  <tr key={m.id} className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#CFE8E8] text-[#073D44] flex items-center justify-center text-[12px] font-extrabold shrink-0">
                          {(m.user?.name || '?').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-[13px] font-bold text-slate-900">{m.user?.name || '—'}</span>
                        {isMe && <span className="text-[10px] font-semibold text-slate-400">(you)</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-slate-600 font-semibold">{m.user?.email || '—'}</td>
                    <td className="px-4 py-3">
                      {canAct ? (
                        <select
                          value={m.project_role}
                          disabled={acting === m.user_id}
                          onChange={e => handleRoleChange(m.user_id, e.target.value as ProjectRole)}
                          className="h-8 rounded-lg border border-slate-200 px-2 text-[12px] font-semibold text-slate-700 focus:outline-none"
                        >
                          <option value="project_manager">Project Manager</option>
                          <option value="qa_lead">QA Lead</option>
                          <option value="tester">Tester</option>
                        </select>
                      ) : (
                        <Badge label={ROLE_LABEL[m.project_role]} tone={ROLE_TONE[m.project_role]} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-slate-500 font-semibold whitespace-nowrap">{fmtDt(m.assigned_at)}</td>
                    <td className="px-4 py-3">
                      {canAct ? (
                        <button type="button" onClick={() => handleRemove(m.user_id)} disabled={acting === m.user_id}
                          className="h-7 px-2.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-[11px] font-semibold disabled:opacity-60">
                          Remove
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-400 font-semibold">
                          {isMe ? 'You' : isLastPM ? 'Last PM' : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Member Modal */}
      {addOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-[20px] shadow-xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 bg-[#CFE8E8] border-b border-[#073D44]/15 flex items-center justify-between">
              <div className="text-[16px] font-extrabold text-[#073D44]">Add Member</div>
              <button type="button" onClick={() => setAddOpen(false)} className="h-9 px-3 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700">Close</button>
            </div>
            <div className="p-6 space-y-4">
              {addError && <div className="text-[12px] font-semibold text-rose-700">{addError}</div>}
              <div>
                <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">User <span className="text-rose-500">*</span></label>
                <select value={addForm.user_id} onChange={e => setAddForm(f => ({ ...f, user_id: e.target.value }))}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold focus:outline-none">
                  <option value="">Select a user</option>
                  {availableUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[12px] font-extrabold uppercase tracking-widest text-slate-700">Project Role <span className="text-rose-500">*</span></label>
                <select value={addForm.project_role} onChange={e => setAddForm(f => ({ ...f, project_role: e.target.value as ProjectRole }))}
                  className="mt-2 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-semibold focus:outline-none">
                  <option value="project_manager">Project Manager</option>
                  <option value="qa_lead">QA Lead</option>
                  <option value="tester">Tester</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setAddOpen(false)} className="h-10 px-4 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700">Cancel</button>
                <button type="button" onClick={handleAdd} disabled={addSaving || !addForm.user_id}
                  className="h-10 px-4 rounded-xl bg-[#073D44] text-white font-semibold text-[13px] disabled:opacity-60">
                  {addSaving ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const ProjectDetail: React.FC<ProjectDetailProps> = ({ user, token, onUnauthorized }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<ProjectEntity | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await fetchWithAuth(`/api/projects/${id}`, token, {}, onUnauthorized);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setError(data?.error || 'Project not found'); return; }
        setProject(data.project);
        setMembers(Array.isArray(data.members) ? data.members : []);
      } catch { setError('Unable to load project'); }
      finally { setLoading(false); }
    })();
  }, [id, token]);

  const myMembership = members.find(m => m.user_id === user.id);
  const isSystemAdmin = user.role === 'manager';
  const canEdit = isSystemAdmin || myMembership?.project_role === 'project_manager';

  const TABS: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'requirements', label: 'Requirements' },
    { key: 'modules', label: 'Modules' },
    { key: 'members', label: `Members (${members.length})` },
  ];

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm p-8 text-[13px] text-slate-500 font-semibold">
        Loading project...
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm p-8">
        <div className="text-[16px] font-bold text-slate-900">{error || 'Project not found'}</div>
        <button type="button" onClick={() => navigate('/projects')} className="mt-4 text-[13px] text-[#073D44] font-semibold underline">← Back to Projects</button>
      </div>
    );
  }

  const STATUS_TONE: Record<ProjectStatus, string> = {
    draft: 'bg-slate-100 text-slate-600 border-slate-200',
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    on_hold: 'bg-amber-50 text-amber-700 border-amber-200',
    completed: 'bg-blue-50 text-blue-700 border-blue-200',
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="bg-white border border-slate-200 rounded-[20px] shadow-sm overflow-hidden">
        <div className="px-6 py-5 bg-[#CFE8E8] border-b border-[#073D44]/15">
          <div className="flex items-start gap-3 flex-wrap">
            <button type="button" onClick={() => navigate('/projects')} className="mt-0.5 text-[12px] text-[#073D44]/70 font-semibold hover:text-[#073D44] transition-colors">← Projects</button>
          </div>
          <div className="mt-2 flex items-center gap-3 flex-wrap">
            <span className="text-[13px] font-bold text-[#073D44]/60">{project.project_id}</span>
            <h1 className="text-[18px] font-extrabold text-[#073D44] tracking-tight">{project.name}</h1>
            <Badge label={project.archived ? 'Archived' : STATUS_LABEL[project.status]} tone={project.archived ? 'bg-slate-100 text-slate-600 border-slate-200' : STATUS_TONE[project.status]} />
          </div>
          {project.tags.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {project.tags.map(t => (
                <span key={t} className="px-2 py-0.5 rounded-md bg-[#073D44]/10 text-[11px] font-semibold text-[#073D44]">{t}</span>
              ))}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-white overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-6 py-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors border-b-2 ${activeTab === tab.key ? 'border-[#073D44] text-[#073D44]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'overview' && (
            <OverviewTab
              project={project}
              members={members}
              canEdit={canEdit}
              token={token}
              onUnauthorized={onUnauthorized}
              onUpdated={setProject}
            />
          )}
          {activeTab === 'requirements' && (
            <RequirementsTab project={project} user={user} token={token} onUnauthorized={onUnauthorized} />
          )}
          {activeTab === 'modules' && (
            <ModulesTab project={project} user={user} token={token} onUnauthorized={onUnauthorized} />
          )}
          {activeTab === 'members' && (
            <MembersTab
              project={project}
              members={members}
              currentUser={user}
              token={token}
              onUnauthorized={onUnauthorized}
              onMembersChanged={setMembers}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectDetail;
