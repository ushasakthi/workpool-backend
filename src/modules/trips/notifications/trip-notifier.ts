import { Injectable, Logger } from '@nestjs/common';
import { BookingDocument } from '../../bookings/schemas/booking.schema';
import { PushService } from '../../push/push.service';
import { UsersService } from '../../users/users.service';

const firstName = (name: string) => name.split(' ')[0];

// Push only (no email): these are about the next few minutes. The driver gets
// none during the trip, everything is on their screen while they drive.
@Injectable()
export class TripNotifier {
  private readonly logger = new Logger(TripNotifier.name);

  constructor(
    private readonly pushService: PushService,
    private readonly usersService: UsersService,
  ) {}

  started(
    driverName: string,
    pickupLabel: string,
    departure: string,
    bookings: BookingDocument[],
  ): Promise<void> {
    return this.pushTo(
      bookings,
      `${firstName(driverName)} started the trip`,
      `Be at ${pickupLabel} by ${departure}.`,
      'bookings/trip',
    );
  }

  rideLeft(driverName: string, bookings: BookingDocument[]): Promise<void> {
    return this.pushTo(
      bookings,
      'Ride already left',
      `${firstName(driverName)}'s ride for today has already left. Try another ride.`,
      'rides/search',
    );
  }

  finished(driverName: string, bookings: BookingDocument[]): Promise<void> {
    return this.pushTo(
      bookings,
      'Trip complete',
      `How was your ride with ${firstName(driverName)}?`,
      'bookings',
    );
  }

  // a failed push is only logged, the trip change is already saved
  private async pushTo(
    bookings: BookingDocument[],
    title: string,
    body: string,
    path: string,
  ): Promise<void> {
    if (bookings.length === 0) return;
    try {
      const tokens = await this.usersService.findPushTokens(
        bookings.map((booking) => String(booking.passengerId)),
      );
      for (const booking of bookings) {
        const token = tokens.get(String(booking.passengerId));
        if (token) {
          await this.pushService.sendPush(token, title, body, { path });
        }
      }
    } catch (err) {
      this.logger.warn(
        `Trip notification not sent: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
