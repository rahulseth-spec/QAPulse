import mongoose from 'mongoose';

const TcCountSchema = new mongoose.Schema(
  {
    total: { type: Number, default: 0 },
    pass: { type: Number, default: 0 },
    fail: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
  },
  { _id: false }
);

const ModuleSchema = new mongoose.Schema(
  {
    project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    name_normalized: { type: String, required: true },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    linked_req_ids: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Requirement' }],
      default: [],
    },
    parent_module_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Module',
      default: null,
    },
    depth: { type: Number, default: 0 }, // 0 = root, 1 = sub-module
    tc_count: { type: TcCountSchema, default: () => ({ total: 0, pass: 0, fail: 0, pending: 0 }) },
    archived: { type: Boolean, default: false },
    archived_at: { type: Date, default: null },
    archived_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// Name unique within project among non-archived modules
ModuleSchema.index(
  { project_id: 1, name_normalized: 1 },
  { unique: true, partialFilterExpression: { archived: false } }
);
ModuleSchema.index({ project_id: 1, archived: 1 });
ModuleSchema.index({ parent_module_id: 1 });
ModuleSchema.index({ linked_req_ids: 1 });

ModuleSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Module', ModuleSchema);
