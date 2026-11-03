import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { BookingStatus, RideStatus } from '../../common/constants';
import { RidesService } from '../rides/rides.service';
import { TrustScoreUpdater } from '../trust-score/trust-score.updater';
import { UsersService } from '../users/users.service';
import { BookingsService } from './bookings.service';
import { BookingSide } from './dto/list-my-bookings-query.dto';
import { Review } from '../reviews/schemas/review.schema';
import { Booking } from './schemas/booking.schema';

interface MockBookingModel {
  (doc: Record<string, unknown>): { save: jest.Mock };
  exists: jest.Mock;
  find: jest.Mock;
  findOneAndUpdate: jest.Mock;
  updateOne: jest.Mock;
}

const RIDE_ID = '5f9d88b8b54764421b7156c1';

// mongoose query: .exec() resolves to the value
const query = (value: unknown) => ({
  exec: jest.fn().mockResolvedValue(value),
});

describe('BookingsService', () => {
  let service: BookingsService;
  let bookingModel: MockBookingModel;
  let ridesService: {
    getRideOrThrow: jest.Mock;
    findRideIdsByDriver: jest.Mock;
    reserveSeats: jest.Mock;
    releaseSeats: jest.Mock;
  };
  let usersService: { getPublicProfile: jest.Mock };
  let trustScoreUpdater: { recalculate: jest.Mock };
  let reviewModel: { exists: jest.Mock };
  let lastSaved: Record<string, unknown> | undefined;

  const rideDoc = (overrides: Record<string, unknown> = {}) => ({
    id: RIDE_ID,
    driverId: 'driver-1',
    origin: { lat: 6.9, lng: 79.8, label: 'Home' },
    destination: { lat: 6.95, lng: 79.85, label: 'Office' },
    departureTime: new Date('2099-01-01T02:00:00Z'),
    daysOfWeek: [],
    seatsAvailable: 3,
    costContribution: 400,
    status: RideStatus.ACTIVE,
    ...overrides,
  });

  const bookingDoc = (overrides: Record<string, unknown> = {}) => ({
    id: 'booking-1',
    rideId: RIDE_ID,
    passengerId: 'passenger-1',
    status: BookingStatus.REQUESTED,
    seatsRequested: 2,
    requestedAt: new Date('2099-01-01T00:00:00Z'),
    ...overrides,
  });

  beforeEach(async () => {
    lastSaved = undefined;
    const ctor = jest.fn((doc: Record<string, unknown>) => {
      lastSaved = doc;
      return { save: jest.fn().mockResolvedValue(bookingDoc(doc)) };
    }) as unknown as MockBookingModel;
    ctor.exists = jest.fn().mockReturnValue(query(null));
    ctor.find = jest.fn();
    ctor.findOneAndUpdate = jest.fn();
    ctor.updateOne = jest.fn().mockReturnValue(query({}));
    bookingModel = ctor;

    ridesService = {
      getRideOrThrow: jest.fn().mockResolvedValue(rideDoc()),
      findRideIdsByDriver: jest.fn(),
      reserveSeats: jest.fn(),
      releaseSeats: jest.fn(),
    };
    usersService = { getPublicProfile: jest.fn() };
    trustScoreUpdater = { recalculate: jest.fn() };
    reviewModel = { exists: jest.fn().mockReturnValue(query(null)) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: getModelToken(Booking.name), useValue: bookingModel },
        { provide: getModelToken(Review.name), useValue: reviewModel },
        { provide: RidesService, useValue: ridesService },
        { provide: UsersService, useValue: usersService },
        { provide: TrustScoreUpdater, useValue: trustScoreUpdater },
      ],
    }).compile();

    service = module.get(BookingsService);
  });

  describe('request', () => {
    const input = { rideId: RIDE_ID, seatsRequested: 2 };

    it('saves a requested booking without taking seats yet', async () => {
      const result = await service.request('passenger-1', input);

      expect(lastSaved).toMatchObject({
        rideId: RIDE_ID,
        passengerId: 'passenger-1',
        seatsRequested: 2,
        status: BookingStatus.REQUESTED,
      });
      expect(ridesService.reserveSeats).not.toHaveBeenCalled();
      expect(result.status).toBe(BookingStatus.REQUESTED);
    });

    it('rejects booking your own ride', async () => {
      await expect(service.request('driver-1', input)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a ride that is not active', async () => {
      ridesService.getRideOrThrow.mockResolvedValue(
        rideDoc({ status: RideStatus.PAUSED }),
      );

      await expect(service.request('passenger-1', input)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects more seats than the ride has left', async () => {
      ridesService.getRideOrThrow.mockResolvedValue(
        rideDoc({ seatsAvailable: 1 }),
      );

      await expect(service.request('passenger-1', input)).rejects.toThrow(
        'Only 1 seat(s) left on this ride',
      );
    });

    it('rejects a second open booking on the same ride', async () => {
      bookingModel.exists.mockReturnValue(query({ _id: 'existing' }));

      await expect(service.request('passenger-1', input)).rejects.toThrow(
        ConflictException,
      );
      expect(bookingModel).not.toHaveBeenCalled();
    });
  });

  describe('accept', () => {
    it('claims a pending request, then reserves the seats', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(
        query(bookingDoc({ status: BookingStatus.ACCEPTED })),
      );
      ridesService.reserveSeats.mockResolvedValue(true);

      const result = await service.accept('booking-1');

      const [filter] = bookingModel.findOneAndUpdate.mock.calls[0] as [
        Record<string, unknown>,
      ];
      expect(filter).toEqual({
        _id: 'booking-1',
        status: BookingStatus.REQUESTED,
      });
      expect(ridesService.reserveSeats).toHaveBeenCalledWith(RIDE_ID, 2);
      expect(result.status).toBe(BookingStatus.ACCEPTED);
    });

    it('refuses a request that was already answered', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(query(null));

      await expect(service.accept('booking-1')).rejects.toThrow(
        ConflictException,
      );
      expect(ridesService.reserveSeats).not.toHaveBeenCalled();
    });

    it('puts the request back to pending when the seats are gone', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(
        query(bookingDoc({ status: BookingStatus.ACCEPTED })),
      );
      ridesService.reserveSeats.mockResolvedValue(false);

      await expect(service.accept('booking-1')).rejects.toThrow(
        'Not enough seats left on this ride',
      );
      expect(bookingModel.updateOne).toHaveBeenCalledWith(
        { _id: 'booking-1' },
        {
          $set: { status: BookingStatus.REQUESTED },
          $unset: { respondedAt: 1 },
        },
      );
    });
  });

  describe('reject', () => {
    it('rejects a pending request', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(
        query(bookingDoc({ status: BookingStatus.REJECTED })),
      );

      const result = await service.reject('booking-1');

      expect(result.status).toBe(BookingStatus.REJECTED);
    });

    it('refuses a request that was already answered', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(query(null));

      await expect(service.reject('booking-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('cancel', () => {
    it('gives the seats back when an accepted booking is cancelled', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(
        query(bookingDoc({ status: BookingStatus.ACCEPTED })),
      );

      const result = await service.cancel('booking-1', 'passenger-1');

      const [, update] = bookingModel.findOneAndUpdate.mock.calls[0] as [
        unknown,
        { $set: Record<string, unknown> },
      ];
      expect(update.$set.cancelledBy).toBe('passenger-1');
      expect(ridesService.releaseSeats).toHaveBeenCalledWith(RIDE_ID, 2);
      expect(trustScoreUpdater.recalculate).toHaveBeenCalledWith('passenger-1');
      expect(result.status).toBe(BookingStatus.CANCELLED);
    });

    it('does not touch seats when a pending request is cancelled', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(query(bookingDoc()));

      await service.cancel('booking-1', 'passenger-1');

      expect(ridesService.releaseSeats).not.toHaveBeenCalled();
      // withdrawing an unanswered request doesn't affect Trust Score
      expect(trustScoreUpdater.recalculate).not.toHaveBeenCalled();
    });

    it('refuses a booking that is already closed', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(query(null));

      await expect(service.cancel('booking-1', 'passenger-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('complete', () => {
    it('completes an accepted booking and frees the seats', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(
        query(bookingDoc({ status: BookingStatus.COMPLETED })),
      );

      const result = await service.complete('booking-1');

      expect(ridesService.releaseSeats).toHaveBeenCalledWith(RIDE_ID, 2);
      expect(trustScoreUpdater.recalculate).toHaveBeenCalledWith('passenger-1');
      expect(trustScoreUpdater.recalculate).toHaveBeenCalledWith('driver-1');
      expect(result.status).toBe(BookingStatus.COMPLETED);
    });

    it('refuses a booking that was never accepted', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(query(null));

      await expect(service.complete('booking-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('listMine', () => {
    const mockFind = (bookings: unknown[]) => {
      const sort = jest.fn().mockReturnValue(query(bookings));
      bookingModel.find.mockReturnValue({ sort });
    };

    it('as a passenger, lists my bookings with the driver as the other party', async () => {
      mockFind([bookingDoc()]);
      usersService.getPublicProfile.mockResolvedValue({
        id: 'driver-1',
        trustScore: { score: 72 },
        name: 'Nimal',
      });

      const result = await service.listMine(
        'passenger-1',
        BookingSide.PASSENGER,
      );

      expect(bookingModel.find).toHaveBeenCalledWith({
        passengerId: 'passenger-1',
      });
      expect(usersService.getPublicProfile).toHaveBeenCalledWith(
        'driver-1',
        'passenger-1',
      );
      expect(result[0]).toMatchObject({
        id: 'booking-1',
        ride: { costContribution: 400, seatsAvailable: 3 },
        otherParty: { name: 'Nimal', trustScore: 72 },
      });
    });

    it('says whether I already reviewed a completed booking', async () => {
      mockFind([bookingDoc({ status: BookingStatus.COMPLETED })]);
      usersService.getPublicProfile.mockResolvedValue({
        id: 'driver-1',
        name: 'Nimal',
        trustScore: { score: 72 },
      });
      reviewModel.exists.mockReturnValue(query({ _id: 'review-1' }));

      const [item] = await service.listMine(
        'passenger-1',
        BookingSide.PASSENGER,
      );

      expect(reviewModel.exists).toHaveBeenCalledWith({
        bookingId: 'booking-1',
        fromUserId: 'passenger-1',
      });
      expect(item.reviewedByMe).toBe(true);
    });

    it('as a driver, lists requests on my rides, filtered by status', async () => {
      ridesService.findRideIdsByDriver.mockResolvedValue([RIDE_ID]);
      mockFind([bookingDoc()]);
      usersService.getPublicProfile.mockResolvedValue({
        id: 'passenger-1',
        trustScore: { score: null },
        name: 'Ushaa',
      });

      const result = await service.listMine(
        'driver-1',
        BookingSide.DRIVER,
        BookingStatus.REQUESTED,
      );

      expect(bookingModel.find).toHaveBeenCalledWith({
        rideId: { $in: [RIDE_ID] },
        status: BookingStatus.REQUESTED,
      });
      expect(result[0].otherParty.name).toBe('Ushaa');
    });
  });

  describe('getSavings', () => {
    it('adds up the month from both sides, with each ride looked up once', async () => {
      // 1st find = as passenger (2 rides), 2nd = as driver (none)
      bookingModel.find
        .mockReturnValueOnce(
          query([
            bookingDoc({ status: BookingStatus.COMPLETED, seatsRequested: 1 }),
            bookingDoc({ status: BookingStatus.COMPLETED, seatsRequested: 1 }),
          ]),
        )
        .mockReturnValueOnce(query([]));
      ridesService.findRideIdsByDriver.mockResolvedValue([]);

      const result = await service.getSavings('passenger-1', '2026-10');

      const [filter] = bookingModel.find.mock.calls[0] as [
        { completedAt: { $gte: Date; $lt: Date }; passengerId: string },
      ];
      expect(filter.passengerId).toBe('passenger-1');
      expect(filter.completedAt.$gte.toISOString()).toBe(
        '2026-09-30T18:30:00.000Z',
      );
      expect(ridesService.getRideOrThrow).toHaveBeenCalledTimes(1);
      expect(result.month).toBe('2026-10');
      expect(result.asPassenger).toMatchObject({
        rides: 2,
        contributions: 800,
      });
      expect(result.asDriver.rides).toBe(0);
    });
  });
});
