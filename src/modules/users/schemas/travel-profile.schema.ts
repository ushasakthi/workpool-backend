import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { PreferredRole, Weekday } from '../../../common/constants';
import {
  GeoPoint,
  GeoPointSchema,
} from '../../../common/schemas/geo-point.schema';

// GeoPoint moved to common/ once Ride (origin/destination) needed the same shape.
// Re-exported here so existing imports (serializers/user-profile.serializer.ts)
// keep resolving. The privacy transform that fuzzes it for other users lives in
// serializers/user-profile.serializer.ts.
export { GeoPoint, GeoPointSchema };

// Embedded in User (not referenced): it's always read together with the user,
// has a fixed set of fields, and doesn't grow unbounded. See the data model notes.
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

  // When true, other users see only the approximate work point, never the
  // workplace name/label. The owner always sees their own exact details.
  @Prop({ default: false })
  hideWorkplaceName!: boolean;
}

export const TravelProfileSchema = SchemaFactory.createForClass(TravelProfile);
