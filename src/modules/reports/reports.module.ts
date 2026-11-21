import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminLogModule } from '../admin-log/admin-log.module';
import { BookingsModule } from '../bookings/bookings.module';
import { TrustScoreModule } from '../trust-score/trust-score.module';
import { UsersModule } from '../users/users.module';
import {
  AdminReportsController,
  ReportsController,
} from './reports.controller';
import { ReportsService } from './reports.service';
import { Report, ReportSchema } from './schemas/report.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Report.name, schema: ReportSchema }]),
    BookingsModule,
    UsersModule,
    TrustScoreModule,
    AdminLogModule,
  ],
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
