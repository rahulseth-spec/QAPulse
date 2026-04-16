import mongoose from 'mongoose';

const ProjectMemberSchema = new mongoose.Schema(
  {
    project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    project_role: {
      type: String,
      enum: ['project_manager', 'qa_lead', 'tester'],
      required: true,
    },
    assigned_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assigned_at: { type: Date, default: () => new Date() },
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
    removed_at: { type: Date, default: null },
    removed_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// One active membership per user per project
ProjectMemberSchema.index(
  { project_id: 1, user_id: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } }
);
ProjectMemberSchema.index({ user_id: 1, status: 1 });
ProjectMemberSchema.index({ project_id: 1, project_role: 1 });

ProjectMemberSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('ProjectMember', ProjectMemberSchema);
