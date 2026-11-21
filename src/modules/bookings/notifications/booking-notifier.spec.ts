import { Weekday } from '../../../common/constants';
import { MailService } from '../../mail/mail.service';
import { PushService } from '../../push/push.service';
import { RidesService } from '../../rides/rides.service';
import { UsersService } from '../../users/users.service';
import { BookingDocument } from '../schemas/booking.schema';
import { BookingNotifier } from './booking-notifier';

const booking = {
  id: 'booking-1',
  rideId: 'ride-1',
  passengerId: 'passenger-1',
  seatsRequested: 1,
} as unknown as BookingDocument;

describe('BookingNotifier', () => {
  let mailService: { sendBookingEmail: jest.Mock };
  let pushService: { sendPush: jest.Mock };
  let usersService: { findContacts: jest.Mock; findPushTokens: jest.Mock };
  let notifier: BookingNotifier;

  beforeEach(() => {
    mailService = { sendBookingEmail: jest.fn() };
    pushService = { sendPush: jest.fn() };
    const ridesService = {
      getRideOrThrow: jest.fn().mockResolvedValue({
        driverId: 'driver-1',
        origin: { label: 'Rajagiriya' },
        destination: { label: 'Orion Tech Park' },
        daysOfWeek: [Weekday.MON],
        departureTime: new Date('2026-11-02T02:45:00Z'),
      }),
    };
    usersService = {
      findContacts: jest.fn().mockResolvedValue(
        new Map([
          ['passenger-1', { name: 'Kasun Perera', email: 'kasun@x.com' }],
          ['driver-1', { name: 'Nimal Silva', email: 'nimal@x.com' }],
        ]),
      ),
      // nobody has a phone registered unless a test says so
      findPushTokens: jest.fn().mockResolvedValue(new Map()),
    };
    notifier = new BookingNotifier(
      mailService as unknown as MailService,
      pushService as unknown as PushService,
      ridesService as unknown as RidesService,
      usersService as unknown as UsersService,
    );
  });

  it('tells the driver about a new request, by first name', async () => {
    await notifier.requested(booking);

    expect(mailService.sendBookingEmail).toHaveBeenCalledWith(
      'nimal@x.com',
      expect.objectContaining({
        headline: 'Kasun asked for 1 seat on your ride',
        path: 'bookings/requests',
      }),
    );
  });

  it('tells the passenger when the driver accepts or declines', async () => {
    await notifier.answered(booking, true);
    await notifier.answered(booking, false);

    expect(mailService.sendBookingEmail).toHaveBeenNthCalledWith(
      1,
      'kasun@x.com',
      expect.objectContaining({ subject: 'Your seat request was accepted' }),
    );
    expect(mailService.sendBookingEmail).toHaveBeenNthCalledWith(
      2,
      'kasun@x.com',
      expect.objectContaining({ subject: 'Your seat request was declined' }),
    );
  });

  it('tells whoever did not cancel', async () => {
    await notifier.cancelled(booking, 'passenger-1');
    await notifier.cancelled(booking, 'driver-1');

    const recipients = mailService.sendBookingEmail.mock.calls.map(
      (call: unknown[]) => call[0],
    );
    expect(recipients).toEqual(['nimal@x.com', 'kasun@x.com']);
  });

  it('never throws when the email fails', async () => {
    mailService.sendBookingEmail.mockRejectedValue(new Error('SMTP down'));

    await expect(notifier.requested(booking)).resolves.toBeUndefined();
  });

  it('also pushes to a driver with a phone registered', async () => {
    usersService.findPushTokens.mockResolvedValue(
      new Map([['driver-1', 'ExponentPushToken[abc]']]),
    );

    await notifier.requested(booking);

    expect(pushService.sendPush).toHaveBeenCalledWith(
      'ExponentPushToken[abc]',
      'Kasun asked for 1 seat on your ride',
      'Rajagiriya → Orion Tech Park',
      { path: 'bookings/requests' },
    );
  });

  it('skips the push when there is no phone registered', async () => {
    await notifier.requested(booking);

    expect(pushService.sendPush).not.toHaveBeenCalled();
  });

  it('still pushes when the email fails', async () => {
    usersService.findPushTokens.mockResolvedValue(
      new Map([['driver-1', 'ExponentPushToken[abc]']]),
    );
    mailService.sendBookingEmail.mockRejectedValue(new Error('SMTP down'));

    await notifier.requested(booking);

    expect(pushService.sendPush).toHaveBeenCalled();
  });
});
