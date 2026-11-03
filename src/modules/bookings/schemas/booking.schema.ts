import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { BookingStatus } from '../../../common/constants';

export type BookingDocument = HydratedDocument<Booking>;

// a passenger's seat request on a ride, referenced (not embedded) because
// it's read from both the passenger's and the driver's side
@Schema({ timestamps: true })
export class Booking {
  // must be MongooseSchema.Types.ObjectId, Types.ObjectId gets saved as a string
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'Ride',
    required: true,
    index: true,
  })
  rideId!: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  passengerId!: Types.ObjectId;

  @Prop({
    type: String,
    enum: BookingStatus,
    default: BookingStatus.REQUESTED,
    index: true,
  })
  status!: BookingStatus;

  @Prop({ required: true, min: 1 })
  seatsRequested!: number;

  @Prop({ required: true })
  requestedAt!: Date;

  // when the driver accepted or rejected
  @Prop()
  respondedAt?: Date;

  // when the driver marked it completed (for "completed this month")
  @Prop()
  completedAt?: Date;

  // who cancelled (passenger or driver), counts against their Trust Score
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  cancelledBy?: Types.ObjectId;
}

export const BookingSchema = SchemaFactory.createForClass(Booking);
