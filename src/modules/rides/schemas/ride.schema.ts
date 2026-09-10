import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { RideStatus, Weekday } from '../../../common/constants';
import {
  GeoPoint,
  GeoPointSchema,
} from '../../../common/schemas/geo-point.schema';

export type RideDocument = HydratedDocument<Ride>;

// Referenced collection. A recurring commute offer: it runs on `daysOfWeek`,
// with `departureTime` fixing the departure instant (Sprint 4's Smart Matching
// Score reads the time-of-day from it).
@Schema({ timestamps: true })
export class Ride {
  // `MongooseSchema.Types.ObjectId` (not `Types.ObjectId`) is what @nestjs/mongoose
  // recognises as a real ObjectId path — the latter silently degrades to a Mixed
  // (uncast) path, storing the id as a plain string and breaking `populate()`.
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  driverId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Vehicle', required: true })
  vehicleId!: Types.ObjectId;

  // Kept as { lat, lng, label } for consistency with User.travelProfile.
  // Sprint 4 adds a 2dsphere geospatial index for ride search.
  @Prop({ type: GeoPointSchema, required: true })
  origin!: GeoPoint;

  @Prop({ type: GeoPointSchema, required: true })
  destination!: GeoPoint;

  @Prop({ required: true })
  departureTime!: Date;

  @Prop({ type: [String], enum: Weekday, default: [] })
  daysOfWeek!: Weekday[];

  @Prop({ required: true, min: 1 })
  seatsAvailable!: number;

  // Cost-sharing only: a suggested contribution toward shared fuel / running
  // costs. WorkPool is a cost-sharing platform, not commercial ride-hailing —
  // this is never a fare, price, or commission.
  @Prop({ required: true, min: 0 })
  costContribution!: number;

  @Prop({
    type: String,
    enum: RideStatus,
    default: RideStatus.ACTIVE,
    index: true,
  })
  status!: RideStatus;
}

export const RideSchema = SchemaFactory.createForClass(Ride);
