export enum ReportStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  APPROVED = 'APPROVED'
}

export enum HealthStatus {
  GREEN = 'GREEN',
  YELLOW = 'YELLOW',
  RED = 'RED'
}

export enum ConfidenceLevel {
  HIGH = 'HIGH',
  MED = 'MED',
  LOW = 'LOW'
}

export enum ThreadStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  BLOCKED = 'BLOCKED'
}

export enum LoadStatus {
  NORMAL = 'NORMAL',
  OVERLOADED = 'OVERLOADED',
  UNDERUTILIZED = 'UNDERUTILIZED'
}

export enum OwnerRole {
  QA = 'QA',
  DEV = 'DEV',
  PM = 'PM',
  OTHER = 'OTHER'
}

export type UserStatus = 'active' | 'suspended' | 'archived';
export type PermissionLevel = 'view' | 'edit' | 'no_access';
export type RoleStatus = 'active' | 'archived';
export type RolePermissionArea = 'dashboard' | 'userManagement' | 'roleManagement';
export type RolePermissions = Record<RolePermissionArea, PermissionLevel>;

export interface User {
  id: string;
  name: string;
  email: string;
  projects: string[];
  role?: 'manager' | 'qaOwner' | 'reportee' | 'admin' | 'user';
  permissions?: Partial<Permissions>;
  status?: UserStatus;
  role_id?: string | null;
  role_name?: string | null;
  last_login_at?: string | null;
  suspended_at?: string | null;
  archived_at?: string | null;
  created_by?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: RolePermissions;
  status: RoleStatus;
  created_by: string | null;
  archived_at: string | null;
  createdAt: string;
  updatedAt: string;
  user_count?: number;
}

export type PermissionArea = 'dashboard' | 'weeklyReports' | 'docs' | 'userManagement' | 'roleManagement' | 'projectManagement';
export type PermissionAction = 'view' | 'edit';
export type Permissions = Record<PermissionArea, { view: boolean; edit: boolean }>;

export function normalizeRole(raw: unknown): 'manager' | 'qaOwner' | 'reportee' {
  const v = String(raw || '').trim().toLowerCase();
  if (!v) return 'reportee';
  if (v === 'admin' || v === 'superadmin' || v === 'super_admin') return 'manager';
  if (v === 'manager') return 'manager';
  if (v === 'qaowner' || v === 'qa_owner' || v === 'qa owner') return 'qaOwner';
  if (v === 'reportee') return 'reportee';
  if (v === 'user') return 'reportee';
  return 'reportee';
}

export const DEFAULT_PERMISSIONS_BY_ROLE: Record<'manager' | 'qaOwner' | 'reportee', Permissions> = {
  reportee: {
    dashboard: { view: true, edit: false },
    weeklyReports: { view: true, edit: false },
    docs: { view: true, edit: false },
    userManagement: { view: false, edit: false },
    roleManagement: { view: false, edit: false },
    projectManagement: { view: false, edit: false },
  },
  qaOwner: {
    dashboard: { view: true, edit: false },
    weeklyReports: { view: true, edit: true },
    docs: { view: true, edit: false },
    userManagement: { view: false, edit: false },
    roleManagement: { view: false, edit: false },
    projectManagement: { view: true, edit: false },
  },
  manager: {
    dashboard: { view: true, edit: true },
    weeklyReports: { view: true, edit: true },
    docs: { view: true, edit: true },
    userManagement: { view: true, edit: true },
    roleManagement: { view: true, edit: true },
    projectManagement: { view: true, edit: true },
  },
};

export function effectivePermissions(user: User | null | undefined): Permissions {
  const base: Permissions = JSON.parse(JSON.stringify(DEFAULT_PERMISSIONS_BY_ROLE[normalizeRole(user?.role)]));
  const raw = user?.permissions as any;
  if (!raw || typeof raw !== 'object') return base;
  if (raw.weeklyReport && !raw.weeklyReports) raw.weeklyReports = raw.weeklyReport;
  for (const [k, v] of Object.entries(raw)) {
    if (!v || typeof v !== 'object') continue;
    const key = k as PermissionArea;
    if (!(key in base)) continue;
    if (typeof (v as any).view === 'boolean') base[key].view = (v as any).view;
    if (typeof (v as any).edit === 'boolean') base[key].edit = (v as any).edit;
  }
  return base;
}

export function hasPermission(user: User | null | undefined, area: PermissionArea, action: PermissionAction): boolean {
  if (!user) return false;
  if (normalizeRole(user.role) === 'manager') return true;
  const perms = effectivePermissions(user);
  return Boolean(perms?.[area]?.[action]);
}

export interface Project {
  id: string;
  name: string;
  code: string;
}

export interface GoalRow {
  goal: string;
  successMetric: string;
  health: HealthStatus;
  confidence: ConfidenceLevel;
}

export interface DecisionItem {
  decisionText: string;
  ownerRole: OwnerRole;
  dueDate?: string;
}

export interface ThreadRow {
  product?: string;
  thread: string;
  ownerId: string;
  status: ThreadStatus;
}

export type WeeklyReportScope = 'PROJECT' | 'OVERALL';

export interface ExecutionReadinessSlide {
  projectId: string;
  projectNameOverride?: string;
  capacity: {
    plannedHours: number;
    committedHours: number;
    surplusDeficitHours: number;
    loadStatus: LoadStatus;
  };
  strength: {
    activeContributors: number;
    activeContributorNames?: string;
    criticalRoleGaps: boolean;
    gapNotes?: string;
  };
  sprintHealth: {
    startDate: string;
    goalClarity: HealthStatus | 'NA';
    readiness: HealthStatus | 'NA';
  };
  bottlenecks: string[];
  decisions: DecisionItem[];
}

export interface WeeklyReport {
  id: string;
  projectId: string;
  scope?: WeeklyReportScope;
  title: string;
  startDate: string;
  endDate: string;
  isoWeek: number;
  year: number;
  month: number;
  weekOfMonth: 1 | 2 | 3 | 4 | 5;
  status: ReportStatus;
  revisionOf?: string;
  goals: GoalRow[];
  capacity: {
    plannedHours: number;
    committedHours: number;
    surplusDeficitHours: number;
    loadStatus: LoadStatus;
  };
  strength: {
    activeContributors: number;
    activeContributorNames?: string;
    criticalRoleGaps: boolean;
    gapNotes?: string;
  };
  decisions: DecisionItem[];
  sprintHealth: {
    startDate: string;
    goalClarity: HealthStatus | 'NA';
    readiness: HealthStatus | 'NA';
  };
  executionReadinessSlides?: ExecutionReadinessSlide[];
  uedHealth: {
    lastDiscussion: string;
    daysSinceLast: string;
    nextScheduled: string;
    dataAvailable: boolean;
    status: HealthStatus | 'NA';
  };
  bottlenecks: string[];
  threads: ThreadRow[];
  createdBy: string;
  updatedBy: string;
  publishedBy?: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Project Management Types ────────────────────────────────────────────────

export type ProjectStatus = 'draft' | 'active' | 'on_hold' | 'completed';
export type ProjectRole = 'project_manager' | 'qa_lead' | 'tester';
export type MemberStatus = 'active' | 'removed';

export type ReqType = 'functional' | 'non_functional' | 'ui' | 'performance';
export type ReqPriority = 'high' | 'medium' | 'low';
export type ReqStatus = 'draft' | 'under_review' | 'approved' | 'rejected';

export interface ProjectAttachment {
  url: string;
  filename: string;
  size_bytes: number;
  mimetype: string;
}

export interface TcCount {
  total: number;
  pass: number;
  fail: number;
  pending: number;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  project_role: ProjectRole;
  assigned_by: string | null;
  assigned_at: string;
  status: MemberStatus;
  removed_at: string | null;
  user: {
    id: string;
    name: string;
    email: string;
    status: string;
  } | null;
}

export interface ProjectEntity {
  id: string;
  project_id: string;
  name: string;
  description: string;
  start_date: string | null;
  end_date: string | null;
  status: ProjectStatus;
  tags: string[];
  archived: boolean;
  archived_at: string | null;
  req_count: number;
  module_count: number;
  tc_count: number;
  member_count?: number;
  created_by: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Requirement {
  id: string;
  req_id: string;
  req_seq: number;
  project_id: string;
  title: string;
  description: string;
  type: ReqType;
  priority: ReqPriority;
  status: ReqStatus;
  attachment: ProjectAttachment | null;
  coverage: number;
  archived: boolean;
  archived_at: string | null;
  created_by: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModuleEntity {
  id: string;
  project_id: string;
  name: string;
  description: string;
  linked_req_ids: string[];
  parent_module_id: string | null;
  depth: number;
  tc_count: TcCount;
  archived: boolean;
  archived_at: string | null;
  created_by: string | null;
  createdAt: string;
  updatedAt: string;
  sub_modules?: ModuleEntity[];
}

export const PROJECT_STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  draft: ['active'],
  active: ['on_hold', 'completed'],
  on_hold: ['active', 'completed'],
  completed: [],
};

export const REQ_STATUS_TRANSITIONS: Record<ReqStatus, ReqStatus[]> = {
  draft: ['under_review'],
  under_review: ['approved', 'rejected'],
  rejected: ['draft'],
  approved: ['under_review'],
};
