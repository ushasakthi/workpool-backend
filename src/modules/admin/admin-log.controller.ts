import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../../common/constants';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminService } from './admin.service';
import { ListActionLogQueryDto } from './dto/list-action-log-query.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/action-log')
export class AdminLogController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  list(@Query() query: ListActionLogQueryDto) {
    return this.adminService.listActionLog(query.limit);
  }
}
