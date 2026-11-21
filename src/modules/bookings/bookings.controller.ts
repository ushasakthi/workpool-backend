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
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
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
import { TravelDaysQueryDto } from './dto/travel-days-query.dto';
import { VerifyPickupDto } from './dto/verify-pickup.dto';
import { BookingDriverGuard } from './guards/booking-driver.guard';
import { BookingParticipantGuard } from './guards/booking-participant.guard';

const PIN_THROTTLE_LIMIT = 5;
const PIN_THROTTLE_TTL_MS = 60_000;

@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PASSENGER, UserRole.BOTH)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBookingDto,
  ) {
    return this.bookingsService.request(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  findMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMyBookingsQueryDto,
  ) {
    return this.bookingsService.listMine(user.userId, query.as, query.status);
  }

  @UseGuards(JwtAuthGuard)
  @Get('days')
  listTravelDays(@Query() query: TravelDaysQueryDto) {
    return this.bookingsService.listTravelDays(query.rideId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me/savings')
  getSavings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SavingsQueryDto,
  ) {
    return this.bookingsService.getSavings(user.userId, query.month);
  }

  @UseGuards(JwtAuthGuard, BookingDriverGuard)
  @Patch(':id/accept')
  accept(@Param('id') id: string) {
    return this.bookingsService.accept(id);
  }

  @UseGuards(JwtAuthGuard, BookingDriverGuard)
  @Patch(':id/reject')
  reject(@Param('id') id: string) {
    return this.bookingsService.reject(id);
  }

  @UseGuards(JwtAuthGuard, BookingParticipantGuard)
  @Patch(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.cancel(id, user.userId);
  }

  // a 4-digit PIN could be guessed by trying them all, so only a few tries a minute
  @UseGuards(JwtAuthGuard, BookingDriverGuard, ThrottlerGuard)
  @Throttle({
    default: { limit: PIN_THROTTLE_LIMIT, ttl: PIN_THROTTLE_TTL_MS },
  })
  @Patch(':id/verify-pickup')
  verifyPickup(@Param('id') id: string, @Body() dto: VerifyPickupDto) {
    return this.bookingsService.verifyPickup(id, dto.pin);
  }

  @UseGuards(JwtAuthGuard, BookingDriverGuard)
  @Patch(':id/complete')
  complete(@Param('id') id: string) {
    return this.bookingsService.complete(id);
  }
}
