import mongoose from 'mongoose';

const RoleSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    name_normalized: { type: String, required: true },
    description: { type: String, default: '', trim: true },
    permissions: {
      type: Object,
      default: { dashboard: 'no_access' },
    },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    archived_at: { type: Date, default: null },
  },
  { timestamps: true }
);

RoleSchema.index({ name_normalized: 1 }, { unique: true });

RoleSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Role', RoleSchema);
