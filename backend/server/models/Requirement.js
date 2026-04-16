import mongoose from 'mongoose';

const AttachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    filename: { type: String, required: true },
    size_bytes: { type: Number, required: true },
    mimetype: { type: String, required: true },
  },
  { _id: false }
);

const RequirementSchema = new mongoose.Schema(
  {
    req_id: { type: String, required: true },
    req_seq: { type: Number, required: true },
    project_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', required: true },
    title: { type: String, required: true, trim: true, maxlength: 300 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    type: {
      type: String,
      enum: ['functional', 'non_functional', 'ui', 'performance'],
      required: true,
    },
    priority: {
      type: String,
      enum: ['high', 'medium', 'low'],
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'under_review', 'approved', 'rejected'],
      default: 'draft',
    },
    attachment: { type: AttachmentSchema, default: null },
    coverage: { type: Number, default: 0 },
    archived: { type: Boolean, default: false },
    archived_at: { type: Date, default: null },
    archived_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    updated_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

// REQ ID unique per project
RequirementSchema.index({ project_id: 1, req_seq: 1 }, { unique: true });
RequirementSchema.index({ project_id: 1, status: 1, archived: 1 });
RequirementSchema.index({ project_id: 1, archived: 1 });

RequirementSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Requirement', RequirementSchema);
