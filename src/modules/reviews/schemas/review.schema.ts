import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

// referenced: grows over time and is read on its own (public profile)
@Schema({ timestamps: true })
export class Review {
  // must be MongooseSchema.Types.ObjectId, Types.ObjectId gets saved as a string
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Booking', required: true })
  bookingId!: Types.ObjectId;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  fromUserId!: Types.ObjectId;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  toUserId!: Types.ObjectId;

  // which side of the booking the reviewer was on
  @Prop({ type: String, enum: ['passenger', 'driver'], required: true })
  fromRole!: 'passenger' | 'driver';

  @Prop({ required: true, min: 1, max: 5 })
  rating!: number;

  @Prop({ trim: true, maxlength: 500 })
  comment?: string;

  createdAt!: Date;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);

// one review per person per booking
ReviewSchema.index({ bookingId: 1, fromUserId: 1 }, { unique: true });
