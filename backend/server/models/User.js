import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: false },
    googleId: { type: String, required: false },
    resetPasswordTokenHash: { type: String, required: false },
    resetPasswordExpiresAt: { type: Date, required: false },
    projects: { type: [String], default: [] },
    role: { type: String, default: 'reportee' },
    permissions: { type: Object, default: {} },
    // Status and session management
    status: { type: String, enum: ['active', 'suspended', 'archived'], default: 'active' },
    token_version: { type: Number, default: 0 },
    // Role reference (new system)
    role_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Role', default: null },
    // Audit fields
    created_by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    suspended_at: { type: Date, default: null },
    archived_at: { type: Date, default: null },
    last_login_at: { type: Date, default: null },
  },
  { timestamps: true }
);

UserSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.passwordHash;
    delete ret.googleId;
    delete ret.resetPasswordTokenHash;
    delete ret.resetPasswordExpiresAt;
    return ret;
  },
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);
export default User;
