import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { AdminAction } from '../../../common/constants';

export type AdminActionLogDocument = HydratedDocument<AdminActionLog>;

// append-only record of who did what, for accountability (never edited)
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class AdminActionLog {
  // must be MongooseSchema.Types.ObjectId, Types.ObjectId gets saved as a string
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  adminId!: Types.ObjectId;

  @Prop({ type: String, enum: AdminAction, required: true })
  action!: AdminAction;

  // the user the action was about
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', index: true })
  targetUserId?: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Report' })
  reportId?: Types.ObjectId;

  // e.g. the suspension or rejection reason
  @Prop({ trim: true, maxlength: 500 })
  note?: string;

  createdAt!: Date;
}

export const AdminActionLogSchema =
  SchemaFactory.createForClass(AdminActionLog);

// the log is read newest first
AdminActionLogSchema.index({ createdAt: -1 });
