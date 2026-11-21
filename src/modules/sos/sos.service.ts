import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BookingStatus } from '../../common/constants';
import { BookingsService } from '../bookings/bookings.service';
import { RidesService } from '../rides/rides.service';
import { UsersService } from '../users/users.service';
import { Vehicle, VehicleDocument } from '../vehicles/schemas/vehicle.schema';
import { buildSosMessage } from './sos-message';
import { SosAlert, SosAlertDocument } from './schemas/sos-alert.schema';

export interface SosResult {
  alertId: string;
  // the app opens Messages to this number with the message filled in
  contact: { name: string; phone: string };
  message: string;
}

// FR17. The server records the alert and writes the message; the phone sends
// it from the user's own number (no paid SMS gateway needed).
@Injectable()
export class SosService {
  private readonly logger = new Logger(SosService.name);

  constructor(
    @InjectModel(SosAlert.name)
    private readonly sosModel: Model<SosAlertDocument>,
    @InjectModel(Vehicle.name)
    private readonly vehicleModel: Model<VehicleDocument>,
    private readonly bookingsService: BookingsService,
    private readonly ridesService: RidesService,
    private readonly usersService: UsersService,
  ) {}

  async trigger(userId: string, bookingId: string): Promise<SosResult> {
    const parties = await this.bookingsService.getParties(bookingId);
    const isPassenger = userId === parties.passengerId;
    if (!isPassenger && userId !== parties.driverId) {
      throw new ForbiddenException(
        'You can only send an SOS from your own rides',
      );
    }
    if (parties.status !== BookingStatus.ACCEPTED) {
      throw new ConflictException('SOS is only available on an accepted ride');
    }

    const contact = await this.usersService.findEmergencyContact(userId);
    if (!contact) {
      throw new BadRequestException('Add an emergency contact first');
    }

    // saved first, so there's a record even if building the message fails
    const alert = await new this.sosModel({ userId, bookingId }).save();
    this.logger.warn(
      `SOS ${alert.id} from user ${userId} on booking ${bookingId}`,
    );

    const ride = await this.ridesService.getRideOrThrow(parties.rideId);
    const vehicle = await this.vehicleModel.findById(ride.vehicleId).exec();
    const otherId = isPassenger ? parties.driverId : parties.passengerId;
    const names = await this.usersService.findNames([userId, otherId]);

    const message = buildSosMessage({
      senderName: names.get(userId) ?? 'A WorkPool user',
      other: {
        name: names.get(otherId) ?? 'Unknown',
        role: isPassenger ? 'driver' : 'passenger',
      },
      from: ride.origin.label ?? 'Pickup point',
      to: ride.destination.label ?? 'Destination',
      departureTime: ride.departureTime,
      vehicle: vehicle ?? undefined,
      sentAt: alert.createdAt,
    });

    return { alertId: alert.id, contact, message };
  }
}
