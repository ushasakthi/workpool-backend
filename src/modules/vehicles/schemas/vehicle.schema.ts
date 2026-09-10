import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type VehicleDocument = HydratedDocument<Vehicle>;

// Referenced collection (not embedded in User): a user may own more than one,
// and vehicles are read on their own (vehicle list, ride posting) rather than
// always alongside the user. Project rule: "embedding vs referencing follows
// access patterns".
@Schema({ timestamps: true })
export class Vehicle {
  // `MongooseSchema.Types.ObjectId` (not `Types.ObjectId`) is what @nestjs/mongoose
  // recognises as a real ObjectId path — the latter silently degrades to a Mixed
  // (uncast) path, storing the id as a plain string.
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  ownerId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  make!: string;

  @Prop({ required: true, trim: true })
  model!: string;

  @Prop({ required: true })
  year!: number;

  @Prop({ required: true, trim: true, uppercase: true })
  plateNumber!: string;

  @Prop({ required: true, min: 1 })
  seatsAvailable!: number;

  // Soft on/off switch. An inactive vehicle stays on file (and keeps its ride
  // history) but the driver can't post new rides with it — Sprint 4's ride-posting
  // picker filters on this.
  @Prop({ default: true })
  isActive!: boolean;

  // Local filename only — served through GET /vehicles/:id/photo, never a
  // static path. Set exclusively via PATCH /vehicles/:id/photo.
  @Prop()
  photoUrl?: string;
}

export const VehicleSchema = SchemaFactory.createForClass(Vehicle);
