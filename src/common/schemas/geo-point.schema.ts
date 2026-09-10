import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// A single map point ({ lat, lng, label }). Shared by User.travelProfile
// (home/work) and Ride (origin/destination). Stored with full precision — any
// privacy fuzzing happens in a serializer, not here.
@Schema({ _id: false })
export class GeoPoint {
  @Prop({ required: true })
  lat!: number;

  @Prop({ required: true })
  lng!: number;

  @Prop({ trim: true })
  label?: string;
}

export const GeoPointSchema = SchemaFactory.createForClass(GeoPoint);
