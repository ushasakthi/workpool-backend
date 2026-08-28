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
import { Roles } from '../../common/decorators/roles.decorator';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../../common/constants';
import { UsersService } from '../users/users.service';
import { ListVerificationsQueryDto } from './dto/list-verifications-query.dto';
import { ReviewVerificationDto } from './dto/review-verification.dto';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/verifications')
export class AdminController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({
    summary: 'List identity/workplace verification submissions by status',
  })
  @Get()
  listVerifications(@Query() query: ListVerificationsQueryDto) {
    return this.usersService.findVerificationsByStatus(query.status);
  }

  @ApiOperation({ summary: 'Get a single verification submission' })
  @Get(':userId')
  getVerificationSubmission(@Param('userId') userId: string) {
    return this.usersService.findVerificationSubmission(userId);
  }

  @ApiOperation({ summary: 'Approve or reject a verification submission' })
  @Patch(':userId')
  async reviewVerification(
    @Param('userId') userId: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: ReviewVerificationDto,
  ) {
    await this.usersService.reviewVerification(
      userId,
      admin.userId,
      dto.status,
      dto.rejectionReason,
    );
    return { message: 'Verification review recorded.' };
  }
}
