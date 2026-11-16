import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { BookingStatus, RideStatus, Weekday } from '../../common/constants';
import { RidesService } from '../rides/rides.service';
import { TrustScoreUpdater } from '../trust-score/trust-score.updater';
import { UsersService } from '../users/users.service';
import { BookingsService, generatePickupPin } from './bookings.service';
import { BookingSide } from './dto/list-my-bookings-query.dto';
import { BookingNotifier } from './notifications/booking-notifier';
import { Review } from '../reviews/schemas/review.schema';
import { Trip } from '../trips/schemas/trip.schema';
import { Booking } from './schemas/booking.schema';
import { colomboDateString } from './travel-date';

interface MockBookingModel {
  (doc: Record<string, unknown>): { save: jest.Mock };
  exists: jest.Mock;
  find: jest.Mock;
  findById: jest.Mock;
  findOneAndUpdate: jest.Mock;
  updateOne: jest.Mock;
}

const RIDE_ID = '5f9d88b8b54764421b7156c1';

// mongoose query: .exec() resolves to the value
const query = (value: unknown) => ({
  exec: jest.fn().mockResolvedValue(value),
});

// what find().select().exec() returns when counting seats taken on a day
const seatsHeld = (seats: number[]) => ({
  select: () => query(seats.map((seatsRequested) => ({ seatsRequested }))),
});

describe('BookingsService', () => {
  let service: BookingsService;
  let bookingModel: MockBookingModel;
  let ridesService: {
    getRideOrThrow: jest.Mock;
    findRideIdsByDriver: jest.Mock;
  };
  let usersService: { getPublicProfile: jest.Mock };
  let trustScoreUpdater: { recalculate: jest.Mock };
  let notifier: {
    requested: jest.Mock;
    answered: jest.Mock;
    cancelled: jest.Mock;
  };
  let reviewModel: { exists: jest.Mock };
  // no trip has started unless a test says so
  let tripModel: { exists: jest.Mock };
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
    // seats taken on a day: none unless a test says otherwise
    ctor.find = jest.fn().mockReturnValue(seatsHeld([]));
    ctor.findById = jest.fn().mockReturnValue(query(null));
    ctor.findOneAndUpdate = jest.fn();
    ctor.updateOne = jest.fn().mockReturnValue(query({}));
    bookingModel = ctor;

    ridesService = {
      getRideOrThrow: jest.fn().mockResolvedValue(rideDoc()),
      findRideIdsByDriver: jest.fn(),
    };
    usersService = { getPublicProfile: jest.fn() };
    trustScoreUpdater = { recalculate: jest.fn() };
    notifier = {
      requested: jest.fn(),
      answered: jest.fn(),
      cancelled: jest.fn(),
    };
    reviewModel = { exists: jest.fn().mockReturnValue(query(null)) };
    tripModel = { exists: jest.fn().mockReturnValue(query(null)) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: getModelToken(Booking.name), useValue: bookingModel },
        { provide: getModelToken(Review.name), useValue: reviewModel },
        { provide: getModelToken(Trip.name), useValue: tripModel },
        { provide: RidesService, useValue: ridesService },
        { provide: UsersService, useValue: usersService },
        { provide: TrustScoreUpdater, useValue: trustScoreUpdater },
        { provide: BookingNotifier, useValue: notifier },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'pickupWindowMinutes' ? 60 : undefined,
            ),
          },
        },
      ],
    }).compile();

    service = module.get(BookingsService);
  });

  describe('request', () => {
    // Thu 19 Nov 2026
    const input = {
      rideId: RIDE_ID,
      seatsRequested: 2,
      travelDate: '2026-11-19',
    };

    beforeEach(() => {
      // "today" is Wed 18 Nov 2026 in Colombo
      jest.useFakeTimers({ now: new Date('2026-11-18T07:00:00+05:30') });
      ridesService.getRideOrThrow.mockResolvedValue(
        rideDoc({ daysOfWeek: [Weekday.WED, Weekday.THU] }),
      );
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('saves a requested booking without taking seats yet', async () => {
      const result = await service.request('passenger-1', input);

      expect(lastSaved).toMatchObject({
        rideId: RIDE_ID,
        passengerId: 'passenger-1',
        seatsRequested: 2,
        travelDate: '2026-11-19',
        status: BookingStatus.REQUESTED,
      });
      expect(result.status).toBe(BookingStatus.REQUESTED);
      expect(notifier.requested).toHaveBeenCalled();
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

    it('rejects a day whose trip has already left', async () => {
      tripModel.exists.mockReturnValue(query({ _id: 'trip-1' }));

      await expect(service.request('passenger-1', input)).rejects.toThrow(
        'This ride has already left that day',
      );
      expect(bookingModel).not.toHaveBeenCalled();
    });

    it("rejects a day the ride doesn't run", async () => {
      await expect(
        service.request('passenger-1', { ...input, travelDate: '2026-11-20' }),
      ).rejects.toThrow('Pick a day this ride runs, within the next 7 days');
      expect(bookingModel).not.toHaveBeenCalled();
    });

    it('rejects more seats than are left on that day', async () => {
      // 3 offered, 2 already accepted for Thursday
      bookingModel.find.mockReturnValue(seatsHeld([2]));

      await expect(service.request('passenger-1', input)).rejects.toThrow(
        'Only 1 seat(s) left on this ride for that day',
      );
      expect(bookingModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ rideId: RIDE_ID, travelDate: '2026-11-19' }),
      );
    });

    it("doesn't count another day's bookings", async () => {
      // Wednesday is full, but Thursday has nothing booked yet
      bookingModel.find.mockImplementation((filter: { travelDate: string }) =>
        seatsHeld(filter.travelDate === '2026-11-18' ? [3] : []),
      );

      await expect(
        service.request('passenger-1', input),
      ).resolves.toMatchObject({ status: BookingStatus.REQUESTED });
    });

    it('rejects a second open booking on the same ride and day', async () => {
      bookingModel.exists.mockReturnValue(query({ _id: 'existing' }));

      await expect(service.request('passenger-1', input)).rejects.toThrow(
        ConflictException,
      );
      expect(bookingModel.exists).toHaveBeenCalledWith(
        expect.objectContaining({ travelDate: '2026-11-19' }),
      );
      expect(bookingModel).not.toHaveBeenCalled();
    });
  });

  describe('listTravelDays', () => {
    beforeEach(() => {
      // Wed 18 Nov 2026 in Colombo
      jest.useFakeTimers({ now: new Date('2026-11-18T07:00:00+05:30') });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('gives seats left for each day the ride runs', async () => {
      ridesService.getRideOrThrow.mockResolvedValue(
        rideDoc({ daysOfWeek: [Weekday.WED, Weekday.THU] }),
      );
      // 3 offered; Wednesday is full, Thursday has 1 taken
      bookingModel.find.mockImplementation((filter: { travelDate: string }) =>
        seatsHeld(
          filter.travelDate === '2026-11-18'
            ? [3]
            : filter.travelDate === '2026-11-19'
              ? [1]
              : [],
        ),
      );

      const days = await service.listTravelDays(RIDE_ID);

      expect(days).toEqual([
        { date: '2026-11-18', seatsLeft: 0 },
        { date: '2026-11-19', seatsLeft: 2 },
        { date: '2026-11-25', seatsLeft: 3 },
      ]);
    });

    it("leaves out today once today's trip has started", async () => {
      ridesService.getRideOrThrow.mockResolvedValue(
        rideDoc({ daysOfWeek: [Weekday.WED, Weekday.THU] }),
      );
      tripModel.exists.mockImplementation((filter: { date: string }) =>
        query(filter.date === '2026-11-18' ? { _id: 'trip-1' } : null),
      );

      const days = await service.listTravelDays(RIDE_ID);

      expect(days.map((day) => day.date)).toEqual(['2026-11-19', '2026-11-25']);
    });
  });

  describe('accept', () => {
    it('claims a pending request when the day still has room', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(
        query(
          bookingDoc({
            status: BookingStatus.ACCEPTED,
            travelDate: '2026-11-19',
          }),
        ),
      );
      // this booking's 2 seats, out of 3 offered
      bookingModel.find.mockReturnValue(seatsHeld([2]));

      const result = await service.accept('booking-1');

      const [filter, update] = bookingModel.findOneAndUpdate.mock.calls[0] as [
        Record<string, unknown>,
        { $set: Record<string, unknown> },
      ];
      expect(filter).toEqual({
        _id: 'booking-1',
        status: BookingStatus.REQUESTED,
      });
      expect(update.$set.pickupPin).toMatch(/^\d{4}$/);
      expect(bookingModel.find).toHaveBeenCalledWith(
        expect.objectContaining({ rideId: RIDE_ID, travelDate: '2026-11-19' }),
      );
      expect(bookingModel.updateOne).not.toHaveBeenCalled();
      expect(result.status).toBe(BookingStatus.ACCEPTED);
      expect(notifier.answered).toHaveBeenCalledWith(expect.anything(), true);
    });

    it('refuses a request that was already answered', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(query(null));

      await expect(service.accept('booking-1')).rejects.toThrow(
        ConflictException,
      );
      expect(bookingModel.find).not.toHaveBeenCalled();
    });

    it('puts the request back to pending when the day is over-full', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(
        query(bookingDoc({ status: BookingStatus.ACCEPTED })),
      );
      // this booking's 2 seats + 2 already accepted = 4, but only 3 offered
      bookingModel.find.mockReturnValue(seatsHeld([2, 2]));

      await expect(service.accept('booking-1')).rejects.toThrow(
        'Not enough seats left on this ride for that day',
      );
      // the passenger isn't told about an accept that was rolled back
      expect(notifier.answered).not.toHaveBeenCalled();
      expect(bookingModel.updateOne).toHaveBeenCalledWith(
        { _id: 'booking-1' },
        {
          $set: { status: BookingStatus.REQUESTED },
          $unset: { respondedAt: 1, pickupPin: 1 },
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
      expect(notifier.answered).toHaveBeenCalledWith(expect.anything(), false);
    });

    it('refuses a request that was already answered', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(query(null));

      await expect(service.reject('booking-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('cancel', () => {
    it('cancels an accepted booking and tells the other person', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(
        query(bookingDoc({ status: BookingStatus.ACCEPTED })),
      );

      const result = await service.cancel('booking-1', 'passenger-1');

      const [, update] = bookingModel.findOneAndUpdate.mock.calls[0] as [
        unknown,
        { $set: Record<string, unknown> },
      ];
      expect(update.$set.cancelledBy).toBe('passenger-1');
      expect(trustScoreUpdater.recalculate).toHaveBeenCalledWith('passenger-1');
      expect(result.status).toBe(BookingStatus.CANCELLED);
      expect(notifier.cancelled).toHaveBeenCalledWith(
        expect.anything(),
        'passenger-1',
      );
    });

    it('withdraws a pending request quietly', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(query(bookingDoc()));

      await service.cancel('booking-1', 'passenger-1');

      // withdrawing an unanswered request doesn't affect Trust Score
      expect(trustScoreUpdater.recalculate).not.toHaveBeenCalled();
      expect(notifier.cancelled).not.toHaveBeenCalled();
    });

    it('refuses a booking that is already closed', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(query(null));

      await expect(service.cancel('booking-1', 'passenger-1')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('generatePickupPin', () => {
    it('is always 4 digits, zeros included', () => {
      for (let i = 0; i < 200; i++) {
        expect(generatePickupPin()).toMatch(/^\d{4}$/);
      }
    });
  });

  describe('verifyPickup', () => {
    beforeEach(() => {
      bookingModel.findById.mockReturnValue(
        query(bookingDoc({ status: BookingStatus.ACCEPTED })),
      );
      // departs right now, every day, so the time window is open
      ridesService.getRideOrThrow.mockResolvedValue(
        rideDoc({
          departureTime: new Date(),
          daysOfWeek: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        }),
      );
    });

    it('refuses outside the pickup time window, before checking the PIN', async () => {
      ridesService.getRideOrThrow.mockResolvedValue(
        rideDoc({ departureTime: new Date('2099-01-01T02:00:00Z') }),
      );

      const result = service.verifyPickup('booking-1', '4821');
      await expect(result).rejects.toThrow(ConflictException);
      await expect(result).rejects.toThrow(
        'The PIN can only be checked within 60 minutes of departure',
      );
      expect(bookingModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('refuses on a different day from the one booked', async () => {
      const tomorrow = colomboDateString(
        new Date(Date.now() + 24 * 60 * 60 * 1000),
      );
      bookingModel.findById.mockReturnValue(
        query(
          bookingDoc({ status: BookingStatus.ACCEPTED, travelDate: tomorrow }),
        ),
      );

      await expect(service.verifyPickup('booking-1', '4821')).rejects.toThrow(
        'The PIN can only be checked on the day of the trip',
      );
      expect(bookingModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('allows the PIN on the day booked', async () => {
      bookingModel.findById.mockReturnValue(
        query(
          bookingDoc({
            status: BookingStatus.ACCEPTED,
            travelDate: colomboDateString(new Date()),
          }),
        ),
      );
      bookingModel.findOneAndUpdate.mockReturnValue(
        query(
          bookingDoc({
            status: BookingStatus.ACCEPTED,
            pickupVerifiedAt: new Date(),
          }),
        ),
      );

      const result = await service.verifyPickup('booking-1', '4821');

      expect(result.pickupVerifiedAt).toBeInstanceOf(Date);
    });

    it('records the pickup when the PIN is right', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(
        query(
          bookingDoc({
            status: BookingStatus.ACCEPTED,
            pickupVerifiedAt: new Date(),
          }),
        ),
      );

      const result = await service.verifyPickup('booking-1', '4821');

      const [filter] = bookingModel.findOneAndUpdate.mock.calls[0] as [
        Record<string, unknown>,
      ];
      expect(filter).toMatchObject({
        _id: 'booking-1',
        status: BookingStatus.ACCEPTED,
        pickupPin: '4821',
      });
      expect(result.pickupVerifiedAt).toBeInstanceOf(Date);
    });

    it('says "Incorrect PIN" when the booking is waiting but the PIN is wrong', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(query(null));
      bookingModel.exists.mockReturnValue(query({ _id: 'booking-1' }));

      await expect(service.verifyPickup('booking-1', '0000')).rejects.toThrow(
        'Incorrect PIN',
      );
    });

    it('refuses a booking that is not waiting for pickup', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(query(null));
      bookingModel.exists.mockReturnValue(query(null));

      await expect(service.verifyPickup('booking-1', '4821')).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('complete', () => {
    it('completes an accepted booking', async () => {
      bookingModel.findOneAndUpdate.mockReturnValue(
        query(bookingDoc({ status: BookingStatus.COMPLETED })),
      );

      const result = await service.complete('booking-1');

      const [filter] = bookingModel.findOneAndUpdate.mock.calls[0] as [
        Record<string, unknown>,
      ];
      // can't complete a ride the passenger was never picked up for
      expect(filter).toMatchObject({ pickupVerifiedAt: { $exists: true } });

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

      expect(bookingModel.find).toHaveBeenCalledWith(
        { passengerId: 'passenger-1' },
        '+pickupPin',
      );
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

      // no '+pickupPin': the driver's list never loads the PIN
      expect(bookingModel.find).toHaveBeenCalledWith(
        { rideId: { $in: [RIDE_ID] }, status: BookingStatus.REQUESTED },
        undefined,
      );
      expect(result[0].otherParty.name).toBe('Ushaa');
    });

    describe('pickup PIN', () => {
      const accepted = (overrides: Record<string, unknown> = {}) =>
        bookingDoc({
          status: BookingStatus.ACCEPTED,
          pickupPin: '4821',
          ...overrides,
        });

      beforeEach(() => {
        ridesService.findRideIdsByDriver.mockResolvedValue([RIDE_ID]);
        usersService.getPublicProfile.mockResolvedValue({
          id: 'other',
          name: 'Other',
          trustScore: { score: 70 },
        });
      });

      it('shows the passenger their PIN while waiting for pickup', async () => {
        mockFind([accepted()]);

        const [item] = await service.listMine(
          'passenger-1',
          BookingSide.PASSENGER,
        );

        expect(item.pickupPin).toBe('4821');
      });

      it('hides it once the pickup is verified', async () => {
        mockFind([accepted({ pickupVerifiedAt: new Date() })]);

        const [item] = await service.listMine(
          'passenger-1',
          BookingSide.PASSENGER,
        );

        expect(item.pickupPin).toBeUndefined();
      });

      it('never gives it to the driver', async () => {
        mockFind([accepted()]);

        const [item] = await service.listMine('driver-1', BookingSide.DRIVER);

        expect(item.pickupPin).toBeUndefined();
      });
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
