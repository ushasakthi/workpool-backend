import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { UserRole, VerificationStatus } from '../../../common/constants';
import { TravelProfile, TravelProfileSchema } from './travel-profile.schema';
import { TrustScore, TrustScoreSchema } from './trust-score.schema';

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

  // nicNumber is encrypted (AES-256-GCM)
  @Prop({ select: false })
  nicNumber?: string;

  // hash of the NIC for the unique index
  @Prop({ select: false })
  nicNumberHash?: string;

  @Prop()
  nicDocumentUrl?: string;

  @Prop()
  linkedinUrl?: string;

  @Prop()
  photoUrl?: string;

  @Prop({ type: TravelProfileSchema, default: () => ({}) })
  travelProfile!: TravelProfile;

  @Prop({ type: VerificationSchema, default: () => ({}) })
  verification!: Verification;

  @Prop({ type: TrustScoreSchema, default: () => ({}) })
  trustScore!: TrustScore;

  // proof of agreeing to the Terms (cost-sharing, not a hire service)
  @Prop()
  termsAcceptedAt?: Date;

  @Prop()
  termsVersion?: string;

  // suspended users can't log in or use the API, set by an admin
  @Prop({ default: false, index: true })
  suspended!: boolean;

  @Prop()
  suspendedAt?: Date;

  @Prop({ trim: true })
  suspensionReason?: string;

  @Prop({ select: false })
  refreshTokenHash?: string;

  // Expo push token of the phone the user last logged in on (Android only)
  @Prop({ type: String, select: false })
  pushToken?: string | null;

  @Prop({ select: false })
  passwordResetTokenHash?: string;

  @Prop({ select: false })
  passwordResetExpires?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);

// indexes for matching queries
UserSchema.index({ 'travelProfile.daysAvailable': 1 });
UserSchema.index({
  'travelProfile.workLocation.lat': 1,
  'travelProfile.workLocation.lng': 1,
});

// one NIC per account, sparse because many users have no NIC
UserSchema.index({ nicNumberHash: 1 }, { unique: true, sparse: true });
