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

// the passenger or the driver of the booking, e.g. for cancelling
@Injectable()
export class BookingParticipantGuard implements CanActivate {
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

    const { passengerId, driverId } = await findBookingParties(
      params.id,
      this.bookingModel,
      this.ridesService,
    );
    if (user.userId !== passengerId && user.userId !== driverId) {
      throw new ForbiddenException('This is not your booking');
    }
    return true;
  }
}
