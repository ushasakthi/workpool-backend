import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type VehicleDocument = HydratedDocument<Vehicle>;

// separate collection, a user can have several vehicles
@Schema({ timestamps: true })
export class Vehicle {
  // must be MongooseSchema.Types.ObjectId, Types.ObjectId gets saved as a string
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

  // inactive vehicles can't be used for new rides
  @Prop({ default: true })
  isActive!: boolean;

  // filename only, served through GET /vehicles/:id/photo
  @Prop()
  photoUrl?: string;
}

export const VehicleSchema = SchemaFactory.createForClass(Vehicle);
