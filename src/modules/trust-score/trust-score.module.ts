import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Booking, BookingSchema } from '../bookings/schemas/booking.schema';
import { Report, ReportSchema } from '../reports/schemas/report.schema';
import { Review, ReviewSchema } from '../reviews/schemas/review.schema';
import { Ride, RideSchema } from '../rides/schemas/ride.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { TrustScoreService } from './trust-score.service';
import { TrustScoreUpdater } from './trust-score.updater';

// Registers the models it reads directly instead of importing their modules,
// so bookings/reviews/reports/users can all import this without a cycle.
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Ride.name, schema: RideSchema },
      { name: Booking.name, schema: BookingSchema },
      { name: Review.name, schema: ReviewSchema },
      { name: Report.name, schema: ReportSchema },
    ]),
  ],
  providers: [TrustScoreService, TrustScoreUpdater],
  exports: [TrustScoreService, TrustScoreUpdater],
})
export class TrustScoreModule {}
