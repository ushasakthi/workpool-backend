import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// embedded in User: small and shown wherever the user is.
// The counts are a snapshot of the user's history, refreshed by TrustScoreUpdater.
@Schema({ _id: false })
export class TrustScore {
  @Prop({ default: 0 })
  completedRides!: number;

  @Prop({ default: 0 })
  ratingCount!: number;

  @Prop({ default: 0 })
  averageRating!: number;

  @Prop({ default: 0 })
  cancellationCount!: number;

  // weighted by severity (low 1, medium 2, high 3), not a plain count
  @Prop({ default: 0 })
  complaintCount!: number;

  // reports an admin reviewed and upheld; safe to show publicly, unlike complaintCount
  @Prop({ default: 0 })
  upheldComplaints!: number;

  // 0-100, null until it's been calculated once
  @Prop({ type: Number, default: null })
  score!: number | null;

  @Prop()
  updatedAt?: Date;
}

export const TrustScoreSchema = SchemaFactory.createForClass(TrustScore);
