import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { TripStatus } from '../../../common/constants';

export type TripDocument = HydratedDocument<Trip>;

// the real journey of one ride on one day: a ride is the weekly plan,
// a booking is one person's seat, a trip is what actually happens
@Schema({ timestamps: true })
export class Trip {
  // must be MongooseSchema.Types.ObjectId, Types.ObjectId gets saved as a string
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Ride', required: true })
  rideId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  driverId!: Types.ObjectId;

  // "2026-11-19", Colombo day, same format as booking.travelDate
  @Prop({ required: true })
  date!: string;

  @Prop({
    type: String,
    enum: TripStatus,
    default: TripStatus.IN_PROGRESS,
  })
  status!: TripStatus;

  @Prop({ required: true })
  startedAt!: Date;

  @Prop()
  finishedAt?: Date;
}

export const TripSchema = SchemaFactory.createForClass(Trip);

// a ride can only run once a day
TripSchema.index({ rideId: 1, date: 1 }, { unique: true });
// one trip in progress per driver, enforced by the database even if two taps race
TripSchema.index(
  { driverId: 1 },
  {
    unique: true,
    partialFilterExpression: { status: TripStatus.IN_PROGRESS },
  },
);
