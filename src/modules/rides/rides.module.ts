import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersModule } from '../users/users.module';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { RideOwnerGuard } from './guards/ride-owner.guard';
import { Ride, RideSchema } from './schemas/ride.schema';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { SmartMatchingService } from './matching/smart-matching.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ride.name, schema: RideSchema }]),
    VehiclesModule,
    UsersModule,
  ],
  controllers: [RidesController],
  providers: [RidesService, RideOwnerGuard, SmartMatchingService],
  exports: [RidesService],
})
export class RidesModule {}
