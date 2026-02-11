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
