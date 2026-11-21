import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Model } from 'mongoose';
import { UserRole } from '../../../common/constants';
import { RidesService } from '../../rides/rides.service';
import { BookingDocument } from '../schemas/booking.schema';
import { BookingDriverGuard } from './booking-driver.guard';
import { BookingParticipantGuard } from './booking-participant.guard';

const BOOKING_ID = '5f9d88b8b54764421b7156c1';

function contextFor(userId: string, id = BOOKING_ID): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        params: { id },
        user: { userId, email: 'x', role: UserRole.BOTH },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('booking guards', () => {
  let bookingModel: { findById: jest.Mock };
  let ridesService: { getRideOrThrow: jest.Mock };
  let driverGuard: BookingDriverGuard;
  let participantGuard: BookingParticipantGuard;

  beforeEach(() => {
    bookingModel = {
      findById: jest.fn().mockReturnValue({
        select: () => ({
          exec: jest.fn().mockResolvedValue({
            rideId: 'ride-1',
            passengerId: 'passenger-1',
          }),
        }),
      }),
    };
    ridesService = {
      getRideOrThrow: jest.fn().mockResolvedValue({ driverId: 'driver-1' }),
    };

    const model = bookingModel as unknown as Model<BookingDocument>;
    const rides = ridesService as unknown as RidesService;
    driverGuard = new BookingDriverGuard(model, rides);
    participantGuard = new BookingParticipantGuard(model, rides);
  });

  describe('BookingDriverGuard', () => {
    it('lets the driver through', async () => {
      await expect(
        driverGuard.canActivate(contextFor('driver-1')),
      ).resolves.toBe(true);
    });

    it('blocks the passenger', async () => {
      await expect(
        driverGuard.canActivate(contextFor('passenger-1')),
      ).rejects.toThrow(ForbiddenException);
    });

    it('404s on a malformed id', async () => {
      await expect(
        driverGuard.canActivate(contextFor('driver-1', 'nope')),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('BookingParticipantGuard', () => {
    it('lets the passenger and the driver through', async () => {
      await expect(
        participantGuard.canActivate(contextFor('passenger-1')),
      ).resolves.toBe(true);
      await expect(
        participantGuard.canActivate(contextFor('driver-1')),
      ).resolves.toBe(true);
    });

    it('blocks anyone else', async () => {
      await expect(
        participantGuard.canActivate(contextFor('stranger')),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
