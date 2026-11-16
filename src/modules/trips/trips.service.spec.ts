import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import {
  BookingStatus,
  RideStatus,
  TripStatus,
  Weekday,
} from '../../common/constants';
import { BookingsService } from '../bookings/bookings.service';
import { RidesService } from '../rides/rides.service';
import { UsersService } from '../users/users.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { TripNotifier } from './notifications/trip-notifier';
import { Trip } from './schemas/trip.schema';
import {
  DriverTripView,
  PassengerTripView,
} from './serializers/trip.serializer';
import { formatMinutes, tripCanStartAt, TripsService } from './trips.service';

const query = (value: unknown) => ({
  exec: jest.fn().mockResolvedValue(value),
});

// a Colombo date + time as a real instant
const colombo = (iso: string) => new Date(`${iso}+05:30`);
const TODAY = '2026-11-19'; // a Thursday

describe('tripCanStartAt', () => {
  it('is 30 minutes before departure, Colombo time', () => {
    // 08:00 in Colombo
    const departure = colombo('2026-11-02T08:00:00');
    expect(tripCanStartAt(departure, TODAY)).toEqual(
      colombo(`${TODAY}T07:30:00`),
    );
  });

  it('formats minutes as HH:mm', () => {
    expect(formatMinutes(450)).toBe('07:30');
  });
});

describe('TripsService', () => {
  let service: TripsService;
  let tripModel: {
    exists: jest.Mock;
    create: jest.Mock;
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let bookingsService: {
    findForDay: jest.Mock;
    findAcceptedForPassenger: jest.Mock;
    declinePendingForDay: jest.Mock;
    markNotPickedUp: jest.Mock;
    complete: jest.Mock;
  };
  let ridesService: { getRideOrThrow: jest.Mock; findMine: jest.Mock };
  let notifier: {
    started: jest.Mock;
    rideLeft: jest.Mock;
    finished: jest.Mock;
  };

  const rideDoc = (overrides: Record<string, unknown> = {}) => ({
    id: 'ride-1',
    driverId: 'driver-1',
    vehicleId: 'vehicle-1',
    origin: { lat: 6.86, lng: 79.9, label: 'Nugegoda' },
    destination: { lat: 6.91, lng: 79.85, label: 'Colombo 03' },
    departureTime: colombo('2026-11-02T08:00:00'),
    daysOfWeek: [Weekday.THU],
    costContribution: 400,
    status: RideStatus.ACTIVE,
    ...overrides,
  });

  const booking = (id: string, overrides: Record<string, unknown> = {}) => ({
    id,
    rideId: 'ride-1',
    passengerId: `passenger-${id}`,
    seatsRequested: 1,
    status: BookingStatus.ACCEPTED,
    pickupPin: '4719',
    ...overrides,
  });

  const tripDoc = (overrides: Record<string, unknown> = {}) => ({
    id: 'trip-1',
    rideId: 'ride-1',
    driverId: 'driver-1',
    date: TODAY,
    status: TripStatus.IN_PROGRESS,
    startedAt: colombo(`${TODAY}T07:45:00`),
    ...overrides,
  });

  beforeEach(async () => {
    // Thu 19 Nov 2026, 07:40 in Colombo: inside the start window
    jest.useFakeTimers({ now: colombo(`${TODAY}T07:40:00`) });

    tripModel = {
      exists: jest.fn().mockReturnValue(query(null)),
      create: jest
        .fn()
        .mockImplementation((doc: Record<string, unknown>) =>
          Promise.resolve(tripDoc(doc)),
        ),
      findOne: jest.fn().mockReturnValue(query(null)),
      findOneAndUpdate: jest.fn(),
    };
    bookingsService = {
      findForDay: jest.fn().mockResolvedValue([booking('b1')]),
      findAcceptedForPassenger: jest.fn().mockResolvedValue([]),
      declinePendingForDay: jest.fn().mockResolvedValue([]),
      markNotPickedUp: jest.fn(),
      complete: jest.fn(),
    };
    ridesService = {
      getRideOrThrow: jest.fn().mockResolvedValue(rideDoc()),
      findMine: jest.fn().mockResolvedValue([]),
    };
    notifier = { started: jest.fn(), rideLeft: jest.fn(), finished: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TripsService,
        { provide: getModelToken(Trip.name), useValue: tripModel },
        { provide: BookingsService, useValue: bookingsService },
        { provide: RidesService, useValue: ridesService },
        {
          provide: UsersService,
          useValue: {
            getPublicProfile: jest.fn((id: string) =>
              Promise.resolve({
                id,
                name: id === 'driver-1' ? 'Kamal Perera' : 'Nadisha Perera',
                trustScore: { score: 80 },
              }),
            ),
          },
        },
        {
          provide: VehiclesService,
          useValue: {
            findOwnedVehicleOrThrow: jest.fn().mockResolvedValue({
              make: 'Toyota',
              model: 'Aqua',
              plateNumber: 'CAB-4521',
            }),
          },
        },
        { provide: TripNotifier, useValue: notifier },
        { provide: ConfigService, useValue: { get: jest.fn(() => false) } },
      ],
    }).compile();

    service = module.get(TripsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('start', () => {
    it('starts the trip, declines waiting requests and tells everyone', async () => {
      const waiting = [booking('b9', { status: BookingStatus.REQUESTED })];
      bookingsService.declinePendingForDay.mockResolvedValue(waiting);

      const view = await service.start('driver-1', 'ride-1');

      expect(tripModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          rideId: 'ride-1',
          driverId: 'driver-1',
          date: TODAY,
          status: TripStatus.IN_PROGRESS,
        }),
      );
      expect(bookingsService.declinePendingForDay).toHaveBeenCalledWith(
        'ride-1',
        TODAY,
      );
      expect(notifier.started).toHaveBeenCalledWith(
        'Kamal Perera',
        'Nugegoda',
        '08:00',
        [expect.objectContaining({ id: 'b1' })],
      );
      expect(notifier.rideLeft).toHaveBeenCalledWith('Kamal Perera', waiting);
      expect(view.side).toBe('driver');
      expect(view.stops).toHaveLength(1);
    });

    it('only lets the ride’s driver start it', async () => {
      await expect(service.start('someone-else', 'ride-1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses before 30 minutes ahead of departure', async () => {
      jest.setSystemTime(colombo(`${TODAY}T07:20:00`));

      await expect(service.start('driver-1', 'ride-1')).rejects.toThrow(
        'You can start from 07:30',
      );
      expect(tripModel.create).not.toHaveBeenCalled();
    });

    it("refuses on a day the ride doesn't run", async () => {
      ridesService.getRideOrThrow.mockResolvedValue(
        rideDoc({ daysOfWeek: [Weekday.MON] }),
      );

      await expect(service.start('driver-1', 'ride-1')).rejects.toThrow(
        "This ride doesn't run today",
      );
    });

    it('refuses with no riders booked for today', async () => {
      bookingsService.findForDay.mockResolvedValue([]);

      await expect(service.start('driver-1', 'ride-1')).rejects.toThrow(
        'No riders booked for today',
      );
    });

    it('allows only one trip in progress per driver', async () => {
      tripModel.exists.mockReturnValue(query({ _id: 'other-trip' }));

      await expect(service.start('driver-1', 'ride-1')).rejects.toThrow(
        'Finish your current trip first',
      );
      expect(tripModel.create).not.toHaveBeenCalled();
    });

    it('turns a duplicate-key race into a clear 409', async () => {
      tripModel.create.mockRejectedValue({ code: 11000 });

      await expect(service.start('driver-1', 'ride-1')).rejects.toThrow(
        ConflictException,
      );
      expect(notifier.started).not.toHaveBeenCalled();
    });
  });

  describe('current', () => {
    it("shows the driver's trip with stops in pickup order", async () => {
      tripModel.findOne.mockReturnValue(query(tripDoc()));
      bookingsService.findForDay.mockResolvedValue([
        booking('b1', { pickupVerifiedAt: colombo(`${TODAY}T07:52:00`) }),
        booking('b2'),
      ]);

      const view = (await service.current('driver-1')) as DriverTripView;

      expect(view.side).toBe('driver');
      expect(view.stops.map((stop) => stop.bookingId)).toEqual(['b1', 'b2']);
      expect(view.stops[0].pickedUpAt).toBeDefined();
      expect(view.stops[1].pickupLabel).toBe('Nugegoda');
    });

    it("shows a passenger their stop number, PIN and the driver's car", async () => {
      // not driving, but booked on a trip that's in progress
      tripModel.findOne
        .mockReturnValueOnce(query(null))
        .mockReturnValueOnce(query(tripDoc()));
      bookingsService.findAcceptedForPassenger.mockResolvedValue([
        booking('b2'),
      ]);
      bookingsService.findForDay.mockResolvedValue([
        booking('b1'),
        booking('b2'),
        booking('b3'),
      ]);

      const view = (await service.current('passenger-b2')) as PassengerTripView;

      expect(view.side).toBe('passenger');
      expect(view.stopNumber).toBe(2);
      expect(view.stopCount).toBe(3);
      expect(view.booking.pickupPin).toBe('4719');
      expect(view.vehicle).toEqual({
        make: 'Toyota',
        model: 'Aqua',
        plateNumber: 'CAB-4521',
      });
    });

    it('hides the PIN once the passenger is picked up', async () => {
      tripModel.findOne
        .mockReturnValueOnce(query(null))
        .mockReturnValueOnce(query(tripDoc()));
      const pickedUp = booking('b2', { pickupVerifiedAt: new Date() });
      bookingsService.findAcceptedForPassenger.mockResolvedValue([pickedUp]);
      bookingsService.findForDay.mockResolvedValue([pickedUp]);

      const view = (await service.current('passenger-b2')) as PassengerTripView;

      expect(view.booking.pickupPin).toBeUndefined();
      expect(view.booking.pickedUpAt).toBeDefined();
    });

    it('is null when there is no trip right now', async () => {
      await expect(service.current('nobody')).resolves.toBeNull();
    });
  });

  describe('finish', () => {
    it('completes picked-up riders and marks the rest as not picked up', async () => {
      tripModel.findOneAndUpdate.mockReturnValue(
        query(
          tripDoc({
            status: TripStatus.FINISHED,
            finishedAt: colombo(`${TODAY}T08:34:00`),
          }),
        ),
      );
      const picked1 = booking('b1', { pickupVerifiedAt: new Date() });
      const picked2 = booking('b2', {
        pickupVerifiedAt: new Date(),
        seatsRequested: 2,
      });
      const missed = booking('b3');
      bookingsService.findForDay.mockResolvedValue([picked1, picked2, missed]);

      const summary = await service.finish(
        'driver-1',
        '5f9d88b8b54764421b7156c1',
      );

      expect(bookingsService.complete).toHaveBeenCalledWith('b1');
      expect(bookingsService.complete).toHaveBeenCalledWith('b2');
      expect(bookingsService.complete).not.toHaveBeenCalledWith('b3');
      expect(bookingsService.markNotPickedUp).toHaveBeenCalledWith(['b3']);
      expect(notifier.finished).toHaveBeenCalledWith('Kamal Perera', [
        picked1,
        picked2,
      ]);
      expect(summary.riders).toBe(2);
      expect(summary.completedBookingIds).toEqual(['b1', 'b2']);
      expect(summary.co2SavedKg).toBeGreaterThan(0);
    });

    it('keeps riders dropped off on the way in the summary, without completing them again', async () => {
      tripModel.findOneAndUpdate.mockReturnValue(
        query(tripDoc({ status: TripStatus.FINISHED })),
      );
      const droppedOff = booking('b1', {
        status: BookingStatus.COMPLETED,
        pickupVerifiedAt: new Date(),
        completedAt: new Date(),
      });
      const onBoard = booking('b2', { pickupVerifiedAt: new Date() });
      bookingsService.findForDay.mockResolvedValue([droppedOff, onBoard]);

      const summary = await service.finish(
        'driver-1',
        '5f9d88b8b54764421b7156c1',
      );

      expect(bookingsService.complete).toHaveBeenCalledTimes(1);
      expect(bookingsService.complete).toHaveBeenCalledWith('b2');
      expect(notifier.finished).toHaveBeenCalledWith('Kamal Perera', [onBoard]);
      expect(summary.riders).toBe(2);
      expect(summary.completedBookingIds).toEqual(['b1', 'b2']);
    });

    it('refuses a trip that is not in progress (e.g. a double tap)', async () => {
      tripModel.findOneAndUpdate.mockReturnValue(query(null));

      await expect(
        service.finish('driver-1', '5f9d88b8b54764421b7156c1'),
      ).rejects.toThrow('This trip is not in progress');
      expect(bookingsService.complete).not.toHaveBeenCalled();
    });
  });
});
