import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { RidesService } from '../../rides/rides.service';
import { Booking, BookingDocument } from '../schemas/booking.schema';
import { findBookingParties } from './booking-parties';

// only the driver of the booked ride can accept, reject, verify pickup or complete it
@Injectable()
export class BookingDriverGuard implements CanActivate {
  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    private readonly ridesService: RidesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user, params } = context.switchToHttp().getRequest<{
      params: { id?: string };
      user?: AuthenticatedUser;
    }>();
    if (!user) {
      return false;
    }

    const { driverId } = await findBookingParties(
      params.id,
      this.bookingModel,
      this.ridesService,
    );
    if (driverId !== user.userId) {
      throw new ForbiddenException('Only the driver can answer this booking');
    }
    return true;
  }
}
