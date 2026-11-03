import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// stored exact, fuzzing is done in the serializer
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
