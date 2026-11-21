import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { GeoPoint } from './geo-point.schema';

// MongoDB's 2dsphere index only understands GeoJSON, which is [lng, lat]
@Schema({ _id: false })
export class GeoJsonPoint {
  @Prop({ type: String, enum: ['Point'], default: 'Point' })
  type!: 'Point';

  @Prop({ type: [Number], required: true })
  coordinates!: number[];
}

export const GeoJsonPointSchema = SchemaFactory.createForClass(GeoJsonPoint);

export function toGeoJsonPoint(point: GeoPoint): GeoJsonPoint {
  return { type: 'Point', coordinates: [point.lng, point.lat] };
}
