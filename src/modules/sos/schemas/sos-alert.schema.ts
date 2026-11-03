import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type SosAlertDocument = HydratedDocument<SosAlert>;

// a safety record each time someone presses SOS; referenced, not embedded,
// because alerts build up over time and are read by admins
@Schema({ timestamps: { createdAt: true, updatedAt: false } })
export class SosAlert {
  // must be MongooseSchema.Types.ObjectId, Types.ObjectId gets saved as a string
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Booking', required: true })
  bookingId!: Types.ObjectId;

  createdAt!: Date;
}

export const SosAlertSchema = SchemaFactory.createForClass(SosAlert);
