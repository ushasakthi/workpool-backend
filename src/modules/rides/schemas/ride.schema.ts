import { Prop, raw, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { GeoJsonLineString } from '../route-line';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import { RideStatus, Weekday } from '../../../common/constants';
import {
  GeoJsonPoint,
  GeoJsonPointSchema,
} from '../../../common/schemas/geo-json-point.schema';
import {
  GeoPoint,
  GeoPointSchema,
} from '../../../common/schemas/geo-point.schema';

export type RideDocument = HydratedDocument<Ride>;

// Recurring ride on daysOfWeek, departureTime gives the time of day
@Schema({ timestamps: true })
export class Ride {
  // must be MongooseSchema.Types.ObjectId, Types.ObjectId gets saved as a string
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  driverId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Vehicle', required: true })
  vehicleId!: Types.ObjectId;

  @Prop({ type: GeoPointSchema, required: true })
  origin!: GeoPoint;

  @Prop({ type: GeoPointSchema, required: true })
  destination!: GeoPoint;

  // up to 3 places the driver passes through, in driving order
  @Prop({ type: [GeoPointSchema], default: [] })
  via!: GeoPoint[];

  // GeoJSON line start → via → destination, for "route passes near home" search
  @Prop(
    raw({
      type: { type: String, enum: ['LineString'] },
      coordinates: { type: [[Number]] },
    }),
  )
  routeLine?: GeoJsonLineString;

  // GeoJSON copies of origin/destination for the geo index, set by RidesService
  @Prop({ type: GeoJsonPointSchema })
  originPoint?: GeoJsonPoint;

  @Prop({ type: GeoJsonPointSchema })
  destinationPoint?: GeoJsonPoint;

  @Prop({ required: true })
  departureTime!: Date;

  @Prop({ type: [String], enum: Weekday, default: [] })
  daysOfWeek!: Weekday[];

  // goes down as bookings are accepted, 0 = full
  @Prop({ required: true, min: 0 })
  seatsAvailable!: number;

  // shared fuel cost, not a fare
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

// ride search filters by pickup distance, without these it scans every ride
RideSchema.index({ originPoint: '2dsphere' });
RideSchema.index({ destinationPoint: '2dsphere' });
RideSchema.index({ routeLine: '2dsphere' });
