import { Controller, Get, UseGuards } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/constants';
import { AdminService } from './admin.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/stats')
export class AdminStatsController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  getStats() {
    return this.adminService.getStats();
  }
}
