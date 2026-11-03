import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminLogModule } from '../admin-log/admin-log.module';
import {
  AdminActionLog,
  AdminActionLogSchema,
} from '../admin-log/schemas/admin-action-log.schema';
import { Booking, BookingSchema } from '../bookings/schemas/booking.schema';
import { Report, ReportSchema } from '../reports/schemas/report.schema';
import { Ride, RideSchema } from '../rides/schemas/ride.schema';
import { User, UserSchema } from '../users/schemas/user.schema';
import { UsersModule } from '../users/users.module';
import { AdminLogController } from './admin-log.controller';
import { AdminStatsController } from './admin-stats.controller';
import { AdminUsersController } from './admin-users.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    // read-only access for the admin views
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Ride.name, schema: RideSchema },
      { name: Booking.name, schema: BookingSchema },
      { name: Report.name, schema: ReportSchema },
      { name: AdminActionLog.name, schema: AdminActionLogSchema },
    ]),
    UsersModule,
    AdminLogModule,
  ],
  controllers: [
    AdminController,
    AdminStatsController,
    AdminUsersController,
    AdminLogController,
  ],
  providers: [AdminService],
})
export class AdminModule {}
