import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../../mail/mail.service';
import { BookingEmail } from '../../mail/templates/booking-email';
import { PushService } from '../../push/push.service';
import { RidesService } from '../../rides/rides.service';
import { RideDocument } from '../../rides/schemas/ride.schema';
import { UsersService } from '../../users/users.service';
import { BookingDocument } from '../schemas/booking.schema';

interface Contact {
  name: string;
  email: string;
  // only Android users who allowed notifications have one
  pushToken?: string;
}

const firstName = (name: string) => name.split(' ')[0];
const seats = (count: number) => `${count} seat${count === 1 ? '' : 's'}`;

const DRIVER_REASON = 'you offer rides on WorkPool';
const PASSENGER_REASON = 'you requested a ride on WorkPool';

// Emails (and pushes, on Android) the other person when a booking changes.
// A failed send is only logged: the booking change has already been saved and
// must not be undone.
@Injectable()
export class BookingNotifier {
  private readonly logger = new Logger(BookingNotifier.name);

  constructor(
    private readonly mailService: MailService,
    private readonly pushService: PushService,
    private readonly ridesService: RidesService,
    private readonly usersService: UsersService,
  ) {}

  // passenger asked for seats → tell the driver
  requested(booking: BookingDocument): Promise<void> {
    return this.safely(async () => {
      const { ride, passenger, driver } = await this.load(booking);
      await this.tell(driver, {
        subject: 'New seat request on your ride',
        headline: `${firstName(passenger.name)} asked for ${seats(booking.seatsRequested)} on your ride`,
        body: 'Review the request in WorkPool to accept or decline.',
        ride: rideSummary(ride),
        path: 'bookings/requests',
        reason: DRIVER_REASON,
      });
    });
  }

  // driver accepted or declined → tell the passenger
  answered(booking: BookingDocument, accepted: boolean): Promise<void> {
    return this.safely(async () => {
      const { ride, passenger, driver } = await this.load(booking);
      const email: BookingEmail = accepted
        ? {
            subject: 'Your seat request was accepted',
            headline: `${firstName(driver.name)} accepted your seat request`,
            body: 'Your seat is booked. You can see the details in WorkPool.',
            ride: rideSummary(ride),
            path: 'bookings',
            reason: PASSENGER_REASON,
          }
        : {
            subject: 'Your seat request was declined',
            headline: `${firstName(driver.name)} can't take you on this ride`,
            body: 'Search WorkPool for another ride on your route.',
            ride: rideSummary(ride),
            path: 'rides/search',
            reason: PASSENGER_REASON,
          };
      await this.tell(passenger, email);
    });
  }

  // an accepted booking was cancelled → tell whoever didn't cancel
  cancelled(booking: BookingDocument, cancelledBy: string): Promise<void> {
    return this.safely(async () => {
      const { ride, passenger, driver } = await this.load(booking);
      const byPassenger = cancelledBy === String(booking.passengerId);
      const email: BookingEmail = byPassenger
        ? {
            subject: 'A booking on your ride was cancelled',
            headline: `${firstName(passenger.name)} cancelled their seat on your ride`,
            body: 'The seat is free again for other coworkers.',
            ride: rideSummary(ride),
            path: 'bookings/requests',
            reason: DRIVER_REASON,
          }
        : {
            subject: 'Your booking was cancelled',
            headline: `${firstName(driver.name)} cancelled your seat on their ride`,
            body: 'Search WorkPool for another ride on your route.',
            ride: rideSummary(ride),
            path: 'rides/search',
            reason: PASSENGER_REASON,
          };
      await this.tell(byPassenger ? driver : passenger, email);
    });
  }

  // email always; push too when they have a phone registered.
  // Each is guarded on its own, so a failed email doesn't stop the push.
  private async tell(person: Contact, email: BookingEmail): Promise<void> {
    await this.safely(() =>
      this.mailService.sendBookingEmail(person.email, email),
    );
    const token = person.pushToken;
    if (token) {
      await this.safely(() =>
        this.pushService.sendPush(
          token,
          email.headline,
          `${email.ride.from} → ${email.ride.to}`,
          { path: email.path },
        ),
      );
    }
  }

  private async load(booking: BookingDocument): Promise<{
    ride: RideDocument;
    passenger: Contact;
    driver: Contact;
  }> {
    const ride = await this.ridesService.getRideOrThrow(String(booking.rideId));
    const passengerId = String(booking.passengerId);
    const driverId = String(ride.driverId);
    const contacts = await this.usersService.findContacts([
      passengerId,
      driverId,
    ]);
    const tokens = await this.usersService.findPushTokens([
      passengerId,
      driverId,
    ]);
    const passenger = contacts.get(passengerId);
    const driver = contacts.get(driverId);
    if (!passenger || !driver) {
      throw new Error(`Missing contact for booking ${booking.id}`);
    }
    return {
      ride,
      passenger: { ...passenger, pushToken: tokens.get(passengerId) },
      driver: { ...driver, pushToken: tokens.get(driverId) },
    };
  }

  private async safely(send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (err) {
      this.logger.warn(
        `Booking notification not sent: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

function rideSummary(ride: RideDocument): BookingEmail['ride'] {
  return {
    from: ride.origin.label ?? 'Pickup point',
    to: ride.destination.label ?? 'Destination',
    days: ride.daysOfWeek,
    departureTime: ride.departureTime,
  };
}
