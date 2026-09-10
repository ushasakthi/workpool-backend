import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole, VerificationStatus } from '../../../common/constants';
import { TravelProfile, TravelProfileSchema } from './travel-profile.schema';

@Schema({ _id: false })
export class Verification {
  @Prop({
    type: String,
    enum: VerificationStatus,
    default: VerificationStatus.PENDING,
  })
  identityStatus: VerificationStatus = VerificationStatus.PENDING;

  @Prop({
    type: String,
    enum: VerificationStatus,
    default: VerificationStatus.PENDING,
  })
  workplaceStatus: VerificationStatus = VerificationStatus.PENDING;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  rejectionReason?: string;

  @Prop()
  submittedAt?: Date;
}

export const VerificationSchema = SchemaFactory.createForClass(Verification);

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ required: true, select: false })
  passwordHash!: string;

  @Prop({ required: true, trim: true })
  phone!: string;

  @Prop({ type: String, enum: UserRole, default: UserRole.PASSENGER })
  role!: UserRole;

  // Sprint 1 identity/workplace verification fields — reviewed manually by an admin.
  // nicNumber is stored AES-256-GCM encrypted (see common/utils/encryption.util.ts).
  @Prop({ select: false })
  nicNumber?: string;

  // Deterministic HMAC of the NIC number — the encrypted `nicNumber` can't be
  // queried for equality, so this backs the "one NIC per account" unique index.
  @Prop({ select: false })
  nicNumberHash?: string;

  @Prop()
  nicDocumentUrl?: string;

  @Prop()
  linkedinUrl?: string;

  @Prop()
  photoUrl?: string;

  // Embedded — always loaded with the user, bounded field set. The Smart Matching
  // Score (Sprint 4) reads these fields, hence the indexes below.
  @Prop({ type: TravelProfileSchema, default: () => ({}) })
  travelProfile!: TravelProfile;

  @Prop({ type: VerificationSchema, default: () => ({}) })
  verification!: Verification;

  @Prop({ select: false })
  refreshTokenHash?: string;

  @Prop({ select: false })
  passwordResetTokenHash?: string;

  @Prop({ select: false })
  passwordResetExpires?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Smart Matching Score candidate queries filter on workplace proximity and
// weekday availability (project rule: "index Mongo fields used in matching queries").
UserSchema.index({ 'travelProfile.daysAvailable': 1 });
UserSchema.index({
  'travelProfile.workLocation.lat': 1,
  'travelProfile.workLocation.lng': 1,
});

// One NIC number per account. Sparse so the (many) users who never submit
// verification don't collide on a missing value.
UserSchema.index({ nicNumberHash: 1 }, { unique: true, sparse: true });
