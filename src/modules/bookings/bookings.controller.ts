import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { BookingsService } from './bookings.service';
import { CreateBookingDto } from './dto/create-booking.dto';
import { ListMyBookingsQueryDto } from './dto/list-my-bookings-query.dto';
import { SavingsQueryDto } from './dto/savings-query.dto';
import { VerifyPickupDto } from './dto/verify-pickup.dto';
import { BookingDriverGuard } from './guards/booking-driver.guard';
import { BookingParticipantGuard } from './guards/booking-participant.guard';

@ApiTags('bookings')
@ApiBearerAuth()
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @ApiOperation({ summary: 'Request seats on a ride (passenger/both roles)' })
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PASSENGER, UserRole.BOTH)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.request(user.userId, dto);
  }

  @ApiOperation({
    summary: 'My bookings as a passenger, or requests on my rides as a driver',
  })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMyBookingsQueryDto,
  ) {
    return this.bookingsService.listMine(user.userId, query.as, query.status);
  }

  @ApiOperation({
    summary: 'Estimated cost savings for one month (passenger and driver side)',
  })
  @UseGuards(JwtAuthGuard)
  @Get('me/savings')
  getSavings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SavingsQueryDto,
  ) {
    return this.bookingsService.getSavings(user.userId, query.month);
  }

  @ApiOperation({
    summary: 'Accept a request and take the seats (driver only)',
  })
  @UseGuards(JwtAuthGuard, BookingDriverGuard)
  @Patch(':id/accept')
  accept(@Param('id') id: string) {
    return this.bookingsService.accept(id);
  }

  @ApiOperation({ summary: 'Reject a request (driver only)' })
  @UseGuards(JwtAuthGuard, BookingDriverGuard)
  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.bookingsService.reject(id);
  }

  @ApiOperation({ summary: 'Cancel a booking (passenger or driver)' })
  @UseGuards(JwtAuthGuard, BookingParticipantGuard)
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.cancel(id, user.userId);
  }

  @ApiOperation({
    summary: "Check the passenger's pickup PIN (driver only, FR13)",
  })
  @UseGuards(JwtAuthGuard, BookingDriverGuard)
  @Patch(':id/verify-pickup')
  verifyPickup(@Param('id') id: string, @Body() dto: VerifyPickupDto) {
    return this.bookingsService.verifyPickup(id, dto.pin);
  }

  @ApiOperation({
    summary:
      'Mark an accepted, pickup-verified booking completed (driver only)',
  })
  @UseGuards(JwtAuthGuard, BookingDriverGuard)
  @Patch(':id/complete')
  complete(@Param('id') id: string) {
    return this.bookingsService.complete(id);
  }
}
