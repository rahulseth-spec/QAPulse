import mongoose from 'mongoose';

const GoalRowSchema = new mongoose.Schema(
  {
    goal: { type: String, default: '' },
    successMetric: { type: String, default: '' },
    health: { type: String, default: 'GREEN' },
    confidence: { type: String, default: 'MED' },
  },
  { _id: false }
);

const DecisionItemSchema = new mongoose.Schema(
  {
    decisionText: { type: String, default: '' },
    ownerRole: { type: String, default: 'QA' },
    dueDate: { type: String, default: '' },
  },
  { _id: false }
);

const ThreadRowSchema = new mongoose.Schema(
  {
    product: { type: String, default: '' },
    thread: { type: String, default: '' },
    ownerId: { type: String, default: '' },
    status: { type: String, default: 'IN_PROGRESS' },
  },
  { _id: false }
);

const WeeklyReportSchema = new mongoose.Schema(
  {
    reportId: { type: String, required: true },

    projectId: { type: String, required: true },
    title: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    isoWeek: { type: Number, required: true },
    year: { type: Number, required: true },
    month: { type: Number, required: true },
    weekOfMonth: { type: Number, required: true },
    status: { type: String, required: true },
    revisionOf: { type: String, required: false },

    goals: { type: [GoalRowSchema], default: [] },
    capacity: {
      plannedHours: { type: Number, default: 0 },
      committedHours: { type: Number, default: 0 },
      surplusDeficitHours: { type: Number, default: 0 },
      loadStatus: { type: String, default: 'NORMAL' },
    },
    strength: {
      activeContributors: { type: Number, default: 0 },
      activeContributorNames: { type: String, default: '' },
      criticalRoleGaps: { type: Boolean, default: false },
      gapNotes: { type: String, default: '' },
    },
    decisions: { type: [DecisionItemSchema], default: [] },
    sprintHealth: {
      startDate: { type: String, default: '' },
      goalClarity: { type: String, default: 'NA' },
      readiness: { type: String, default: 'NA' },
    },
    uedHealth: {
      lastDiscussion: { type: String, default: '' },
      daysSinceLast: { type: String, default: '' },
      nextScheduled: { type: String, default: '' },
      dataAvailable: { type: Boolean, default: false },
      status: { type: String, default: 'NA' },
    },
    bottlenecks: { type: [String], default: [] },
    threads: { type: [ThreadRowSchema], default: [] },

    createdBy: { type: String, required: true },
    updatedBy: { type: String, required: true },
    publishedBy: { type: String, required: false },
  },
  { timestamps: true }
);

WeeklyReportSchema.index({ reportId: 1, createdBy: 1 }, { unique: true });

WeeklyReportSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret.reportId;
    ret.createdAt = ret.createdAt instanceof Date ? ret.createdAt.toISOString() : ret.createdAt;
    ret.updatedAt = ret.updatedAt instanceof Date ? ret.updatedAt.toISOString() : ret.updatedAt;
    delete ret.reportId;
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

const WeeklyReport = mongoose.models.WeeklyReport || mongoose.model('WeeklyReport', WeeklyReportSchema);
export default WeeklyReport;
