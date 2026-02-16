import React from 'react';
import { User, Project, ReportStatus, WeeklyReport, HealthStatus, ConfidenceLevel, LoadStatus, ThreadStatus, OwnerRole } from './types';

export const MOCK_PROJECTS: Project[] = [
  { id: 'p1', name: 'PAL V2', code: 'PALV2' },
  { id: 'p2', name: 'Fusion V2.5', code: 'FUSION25' },
  { id: 'p3', name: 'TestPrep', code: 'TESTPREP' },
  { id: 'p4', name: 'ICT', code: 'ICT' },
  { id: 'p5', name: 'SwiftClass', code: 'SCLASS' },
  { id: 'p6', name: 'SwiftChat', code: 'SCHAT' },
  { id: 'p7', name: 'Swiftee', code: 'SWIFTEE' },
  { id: 'p8', name: 'MIS', code: 'MIS' },
  { id: 'p9', name: 'VSK', code: 'VSK' },
  { id: 'p10', name: 'CMS/CLMS', code: 'CMSCLMS' },
];

export const MOCK_USERS: User[] = [
  { id: 'u1', name: 'Alice Senior', email: 'alice@company.com', projects: ['p1', 'p2', 'p10'] },
  { id: 'u2', name: 'Bob QA', email: 'bob@company.com', projects: ['p1', 'p5', 'p6'] },
  { id: 'u3', name: 'Charlie Admin', email: 'admin@company.com', projects: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10'] },
  { id: 'u4', name: 'Dave Manager', email: 'dave@company.com', projects: ['p10'] },
];

export const MOCK_REPORTS: WeeklyReport[] = [
  {
    id: 'r1',
    projectId: 'p10',
    title: 'Weekly Snapshot – CMSCLMS | 2024-05-13 – 2024-05-19',
    startDate: '2024-05-13',
    endDate: '2024-05-19',
    isoWeek: 20,
    year: 2024,
    month: 5,
    weekOfMonth: 3,
    status: ReportStatus.PUBLISHED,
    goals: [
      { goal: 'Fix UI regressions', successMetric: 'Zero open P0s', health: HealthStatus.GREEN, confidence: ConfidenceLevel.HIGH },
      { goal: 'Load testing API', successMetric: '1000 req/sec sustained', health: HealthStatus.YELLOW, confidence: ConfidenceLevel.MED }
    ],
    capacity: { plannedHours: 120, committedHours: 130, surplusDeficitHours: -10, loadStatus: LoadStatus.OVERLOADED },
    strength: { activeContributors: 8, criticalRoleGaps: false },
    decisions: [
      { decisionText: 'Switch to Postgres for scale', ownerRole: OwnerRole.QA, dueDate: '2024-05-25' }
    ],
    sprintHealth: { startDate: '2024-05-13', goalClarity: HealthStatus.GREEN, readiness: HealthStatus.GREEN },
    uedHealth: {
      lastDiscussion: '2024-05-10',
      daysSinceLast: '3',
      nextScheduled: '2024-05-20',
      dataAvailable: true,
      status: HealthStatus.GREEN
    },
    bottlenecks: ['Staging env instability'],
    threads: [
      { thread: 'Database optimization research', ownerId: 'u2', status: ThreadStatus.IN_PROGRESS }
    ],
    createdBy: 'u2',
    updatedBy: 'u2',
    publishedBy: 'u1',
    createdAt: '2024-05-18T10:00:00Z',
    updatedAt: '2024-05-19T14:00:00Z'
  }
];
