import mongoose from 'mongoose';

const ProjectSchema = new mongoose.Schema(
  {
    project_id: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    name_normalized: { type: String, required: true },
    description: { type: String, required: true, trim: true, maxlength: 2000 },
    start_date: { type: Date, default: null },
    end_date: { type: Date, default: null },
    status: {
      type: String,
      enum: ['draft', 'active', 'on_hold', 'completed'],
      default: 'draft',
    },
    tags: { type: [String], default: [] },
    archived: { type: Boolean, default: false },
    archived_at: { type: Date, default: null },
    archived_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    req_count: { type: Number, default: 0 },
    module_count: { type: Number, default: 0 },
    tc_count: { type: Number, default: 0 },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Global unique name (including archived projects)
ProjectSchema.index({ name_normalized: 1 }, { unique: true });
ProjectSchema.index({ status: 1, archived: 1 });
ProjectSchema.index({ created_by: 1 });

ProjectSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Project', ProjectSchema);
