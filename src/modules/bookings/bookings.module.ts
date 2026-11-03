import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Review, ReviewSchema } from '../reviews/schemas/review.schema';
import { RidesModule } from '../rides/rides.module';
import { TrustScoreModule } from '../trust-score/trust-score.module';
import { UsersModule } from '../users/users.module';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { BookingDriverGuard } from './guards/booking-driver.guard';
import { BookingParticipantGuard } from './guards/booking-participant.guard';
import { Booking, BookingSchema } from './schemas/booking.schema';

@Module({
  imports: [
    // Review is only read here (reviewedByMe); ReviewsModule owns writing it
    MongooseModule.forFeature([
      { name: Booking.name, schema: BookingSchema },
      { name: Review.name, schema: ReviewSchema },
    ]),
    RidesModule,
    UsersModule,
    TrustScoreModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsService, BookingDriverGuard, BookingParticipantGuard],
  exports: [BookingsService],
})
export class BookingsModule {}
