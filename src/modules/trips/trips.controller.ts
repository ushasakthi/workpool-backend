import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../../common/constants';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { StartTripDto } from './dto/start-trip.dto';
import { TripsService } from './trips.service';

@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER, UserRole.BOTH)
  @Get('today')
  today(@CurrentUser() user: AuthenticatedUser) {
    return this.tripsService.todayForDriver(user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('current')
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.tripsService.current(user.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER, UserRole.BOTH)
  @Post()
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartTripDto) {
    return this.tripsService.start(user.userId, dto.rideId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER, UserRole.BOTH)
  @Patch(':id/finish')
  finish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tripsService.finish(user.userId, id);
  }
}
