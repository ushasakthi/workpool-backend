import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BookingsModule } from '../bookings/bookings.module';
import { RidesModule } from '../rides/rides.module';
import { UsersModule } from '../users/users.module';
import { Vehicle, VehicleSchema } from '../vehicles/schemas/vehicle.schema';
import { SosAlert, SosAlertSchema } from './schemas/sos-alert.schema';
import { SosController } from './sos.controller';
import { SosService } from './sos.service';

@Module({
  imports: [
    // Vehicle is only read here (make/model/plate for the message)
    MongooseModule.forFeature([
      { name: SosAlert.name, schema: SosAlertSchema },
      { name: Vehicle.name, schema: VehicleSchema },
    ]),
    BookingsModule,
    RidesModule,
    UsersModule,
  ],
  controllers: [SosController],
  providers: [SosService],
})
export class SosModule {}
