import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VehiclesModule } from '../vehicles/vehicles.module';
import { RideOwnerGuard } from './guards/ride-owner.guard';
import { Ride, RideSchema } from './schemas/ride.schema';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Ride.name, schema: RideSchema }]),
    VehiclesModule,
  ],
  controllers: [RidesController],
  providers: [RidesService, RideOwnerGuard],
})
export class RidesModule {}
