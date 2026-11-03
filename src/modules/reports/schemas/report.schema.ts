import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  ReportCategory,
  ReportSeverity,
  ReportStatus,
} from '../../../common/constants';

export type ReportDocument = HydratedDocument<Report>;

// admin-only: never returned to the reported user (or any non-admin)
@Schema({ timestamps: true })
export class Report {
  // must be MongooseSchema.Types.ObjectId, Types.ObjectId gets saved as a string
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  reportedBy!: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  reportedUser!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Booking', required: true })
  bookingId!: Types.ObjectId;

  // the reported user's side of that booking, shown to the admin
  @Prop({ type: String, enum: ['passenger', 'driver'], required: true })
  reportedRole!: 'passenger' | 'driver';

  @Prop({ type: String, enum: ReportCategory, required: true })
  category!: ReportCategory;

  // optional extra detail, the category is the main reason
  @Prop({ trim: true, maxlength: 500 })
  reason?: string;

  @Prop({
    type: String,
    enum: ReportStatus,
    default: ReportStatus.OPEN,
    index: true,
  })
  status!: ReportStatus;

  // only on reviewed (upheld) reports, weighs the Trust Score penalty
  @Prop({ type: String, enum: ReportSeverity })
  severity?: ReportSeverity;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  resolvedBy?: Types.ObjectId;

  @Prop()
  resolvedAt?: Date;

  createdAt!: Date;
}

export const ReportSchema = SchemaFactory.createForClass(Report);
