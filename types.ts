
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

export interface User {
  id: string;
  name: string;
  email: string;
  projects: string[]; // Project IDs
}

export interface Project {
  id: string;
  name: string;
  code: string; // e.g., CMS, CLMS
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
  thread: string;
  ownerId: string;
  status: ThreadStatus;
}

export interface WeeklyReport {
  id: string;
  projectId: string;
  title: string;
  startDate: string;
  endDate: string;
  isoWeek: number;
  year: number;
  month: number;
  weekOfMonth: 1 | 2 | 3 | 4 | 5;
  status: ReportStatus;
  revisionOf?: string; // ID of the parent report
  
  // Section 1: Weekly Goals & Team Health
  goals: GoalRow[];

  // Section 2: Team Health & Key Decisions
  capacity: {
    plannedHours: number;
    committedHours: number;
    surplusDeficitHours: number;
    loadStatus: LoadStatus;
  };
  strength: {
    activeContributors: number;
    criticalRoleGaps: boolean;
    gapNotes?: string;
  };
  decisions: DecisionItem[];
  sprintHealth: {
    startDate: string;
    goalClarity: HealthStatus | 'NA';
    readiness: HealthStatus | 'NA';
  };
  uedHealth: {
    lastDiscussion: string;
    daysSinceLast: string;
    nextScheduled: string;
    dataAvailable: boolean;
    status: HealthStatus | 'NA';
  };
  bottlenecks: string[];

  // Section 3: Top Team Threads
  threads: ThreadRow[];

  // Audit
  createdBy: string;
  updatedBy: string;
  publishedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditTrail {
  reportId: string;
  userId: string;
  action: string;
  timestamp: string;
}
