import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { StartTripDto } from './dto/start-trip.dto';
import { TripsService } from './trips.service';

@ApiTags('trips')
@ApiBearerAuth()
@Controller('trips')
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @ApiOperation({ summary: "The driver's rides that run today (Start trip)" })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER, UserRole.BOTH)
  @Get('today')
  today(@CurrentUser() user: AuthenticatedUser) {
    return this.tripsService.todayForDriver(user.userId);
  }

  @ApiOperation({
    summary: 'The trip I am on now, as driver or passenger (null if none)',
  })
  @UseGuards(JwtAuthGuard)
  @Get('current')
  current(@CurrentUser() user: AuthenticatedUser) {
    return this.tripsService.current(user.userId);
  }

  @ApiOperation({ summary: "Start today's trip for one of my rides" })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER, UserRole.BOTH)
  @Post()
  start(@CurrentUser() user: AuthenticatedUser, @Body() dto: StartTripDto) {
    return this.tripsService.start(user.userId, dto.rideId);
  }

  @ApiOperation({
    summary: 'Finish the trip: completes picked-up bookings, marks the rest',
  })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER, UserRole.BOTH)
  @Patch(':id/finish')
  finish(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.tripsService.finish(user.userId, id);
  }
}
