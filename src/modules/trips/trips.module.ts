import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingsModule } from '../bookings/bookings.module';
import { PushModule } from '../push/push.module';
import { RidesModule } from '../rides/rides.module';
import { UsersModule } from '../users/users.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { TripNotifier } from './notifications/trip-notifier';
import { Trip, TripSchema } from './schemas/trip.schema';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Trip.name, schema: TripSchema }]),
    BookingsModule,
    RidesModule,
    UsersModule,
    VehiclesModule,
    PushModule,
  ],
  controllers: [TripsController],
  providers: [TripsService, TripNotifier],
})
export class TripsModule {}
