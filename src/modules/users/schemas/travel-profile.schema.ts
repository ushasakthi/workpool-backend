import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { PreferredRole, Weekday } from '../../../common/constants';
import {
  GeoPoint,
  GeoPointSchema,
} from '../../../common/schemas/geo-point.schema';

// GeoPoint is in common/ now, re-exported for old imports
export { GeoPoint, GeoPointSchema };

// embedded in User, always loaded with it
@Schema({ _id: false })
export class TravelProfile {
  @Prop({ type: GeoPointSchema })
  homeLocation?: GeoPoint;

  @Prop({ type: GeoPointSchema })
  workLocation?: GeoPoint;

  @Prop({ trim: true })
  workStartTime?: string;

  @Prop({ trim: true })
  workEndTime?: string;

  @Prop({ type: [String], enum: Weekday, default: [] })
  daysAvailable!: Weekday[];

  @Prop({ type: String, enum: PreferredRole })
  preferredRole?: PreferredRole;

  // if true, other users don't see the workplace name
  @Prop({ default: false })
  hideWorkplaceName!: boolean;
}

export const TravelProfileSchema = SchemaFactory.createForClass(TravelProfile);
