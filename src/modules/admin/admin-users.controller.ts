import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '../../common/constants';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AdminService } from './admin.service';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminService: AdminService) {}

  @ApiOperation({ summary: 'Search and filter users' })
  @Get()
  list(@Query() query: ListUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @ApiOperation({
    summary: "One user's profile, vehicles, travel profile and trips",
  })
  @Get(':id')
  detail(@Param('id') id: string) {
    return this.adminService.getUserDetail(id);
  }

  @ApiOperation({ summary: 'Suspend a user, or lift a suspension' })
  @Patch(':id/suspend')
  suspend(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: SuspendUserDto,
  ) {
    return this.adminService.setSuspended(
      id,
      admin.userId,
      dto.suspended,
      dto.reason,
    );
  }
}
