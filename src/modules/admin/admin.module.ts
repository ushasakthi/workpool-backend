import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { AdminController } from './admin.controller';
import { AdminStatsController } from './admin-stats.controller';

@Module({
  imports: [UsersModule],
  controllers: [AdminController, AdminStatsController],
})
export class AdminModule {}
