import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { RideStatus, Weekday } from '../../common/constants';
import { UsersService } from '../users/users.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { SmartMatchingService } from './matching/smart-matching.service';
import { RidesService } from './rides.service';
import { circlePolygon } from './route-line';
import { Ride } from './schemas/ride.schema';

interface MockRideModel {
  (doc: Record<string, unknown>): { save: jest.Mock };
  findById: jest.Mock;
  find: jest.Mock;
  findByIdAndUpdate: jest.Mock;
}

const VEHICLE_ID = '5f9d88b8b54764421b7156c1';

describe('RidesService', () => {
  let service: RidesService;
  let rideModel: MockRideModel;
  let vehiclesService: { findOwnedVehicleOrThrow: jest.Mock };
  let usersService: { findMe: jest.Mock; getPublicProfile: jest.Mock };
  let lastSaved: Record<string, unknown> | undefined;

  const validInput = () => ({
    vehicleId: VEHICLE_ID,
    origin: { lat: 6.9, lng: 79.8, label: 'Home' },
    destination: { lat: 6.95, lng: 79.85, label: 'Office' },
    departureTime: new Date('2099-01-01T07:30:00Z'),
    daysOfWeek: [Weekday.MON, Weekday.WED],
    seatsAvailable: 3,
    costContribution: 400,
  });

  const rideDoc = (overrides: Record<string, unknown> = {}) => ({
    id: 'ride-1',
    driverId: 'driver-1',
    vehicleId: VEHICLE_ID,
    origin: { lat: 6.9, lng: 79.8, label: 'Home' },
    destination: { lat: 6.95, lng: 79.85, label: 'Office' },
    departureTime: new Date('2099-01-01T07:30:00Z'),
    daysOfWeek: [Weekday.MON, Weekday.WED],
    seatsAvailable: 3,
    costContribution: 400,
    status: RideStatus.ACTIVE,
    ...overrides,
  });

  beforeEach(async () => {
    lastSaved = undefined;
    const ctor = jest.fn((doc: Record<string, unknown>) => {
      lastSaved = doc;
      return { save: jest.fn().mockResolvedValue(rideDoc(doc)) };
    }) as unknown as MockRideModel;
    ctor.findById = jest.fn();
    ctor.find = jest.fn();
    ctor.findByIdAndUpdate = jest.fn();
    rideModel = ctor;

    vehiclesService = { findOwnedVehicleOrThrow: jest.fn() };
    usersService = { findMe: jest.fn(), getPublicProfile: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RidesService,
        { provide: getModelToken(Ride.name), useValue: rideModel },
        { provide: VehiclesService, useValue: vehiclesService },
        { provide: UsersService, useValue: usersService },
        // real service: it's a pure function, no need to mock it
        SmartMatchingService,
      ],
    }).compile();

    service = module.get(RidesService);
  });

  describe('create', () => {
    it('checks the vehicle belongs to the driver, then persists an active ride', async () => {
      vehiclesService.findOwnedVehicleOrThrow.mockResolvedValue({
        seatsAvailable: 4,
      });

      const result = await service.create('driver-1', validInput());

      expect(vehiclesService.findOwnedVehicleOrThrow).toHaveBeenCalledWith(
        VEHICLE_ID,
        'driver-1',
      );
      expect(lastSaved).toMatchObject({
        driverId: 'driver-1',
        status: RideStatus.ACTIVE,
        // GeoJSON is [lng, lat]
        originPoint: { type: 'Point', coordinates: [79.8, 6.9] },
        destinationPoint: { type: 'Point', coordinates: [79.85, 6.95] },
      });
      expect(result).toMatchObject({
        id: 'ride-1',
        driverId: 'driver-1',
        status: RideStatus.ACTIVE,
      });
    });

    it('rejects a vehicle the caller does not own', async () => {
      vehiclesService.findOwnedVehicleOrThrow.mockRejectedValue(
        new NotFoundException('Vehicle not found'),
      );

      await expect(service.create('driver-1', validInput())).rejects.toThrow(
        NotFoundException,
      );
      expect(rideModel).not.toHaveBeenCalled();
    });

    it('rejects a ride offering more seats than the vehicle has', async () => {
      vehiclesService.findOwnedVehicleOrThrow.mockResolvedValue({
        seatsAvailable: 2,
      });

      await expect(
        service.create('driver-1', { ...validInput(), seatsAvailable: 3 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findMine', () => {
    it('filters by driver, newest first', async () => {
      const execMock = jest.fn().mockResolvedValue([rideDoc()]);
      const sortMock = jest.fn().mockReturnValue({ exec: execMock });
      rideModel.find.mockReturnValue({ sort: sortMock });

      const result = await service.findMine('driver-1');

      expect(rideModel.find).toHaveBeenCalledWith({ driverId: 'driver-1' });
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
      expect(result[0].status).toBe(RideStatus.ACTIVE);
    });
  });

  describe('update', () => {
    it('pauses a ride without re-checking the vehicle', async () => {
      rideModel.findByIdAndUpdate.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue(rideDoc({ status: RideStatus.PAUSED })),
      });

      const result = await service.update('ride-1', 'driver-1', {
        status: RideStatus.PAUSED,
      });

      expect(vehiclesService.findOwnedVehicleOrThrow).not.toHaveBeenCalled();
      const [, update] = rideModel.findByIdAndUpdate.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(update).toEqual({ $set: { status: RideStatus.PAUSED } });
      expect(result.status).toBe(RideStatus.PAUSED);
    });

    it('re-validates the vehicle against the new seat count', async () => {
      rideModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(rideDoc()),
      });
      vehiclesService.findOwnedVehicleOrThrow.mockResolvedValue({
        seatsAvailable: 4,
      });
      rideModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(rideDoc({ seatsAvailable: 4 })),
      });

      await service.update('ride-1', 'driver-1', { seatsAvailable: 4 });

      expect(vehiclesService.findOwnedVehicleOrThrow).toHaveBeenCalledWith(
        VEHICLE_ID,
        'driver-1',
      );
    });

    it('throws NotFoundException when the ride does not exist', async () => {
      rideModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.update('missing', 'driver-1', { costContribution: 500 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('search', () => {
    const passenger = (homeLocation?: { lat: number; lng: number }) => ({
      travelProfile: {
        homeLocation,
        workLocation: { lat: 6.95, lng: 79.85 },
        workStartTime: '08:30',
        daysAvailable: [Weekday.MON, Weekday.WED],
      },
    });

    const query = (overrides: Record<string, unknown> = {}) => ({
      maxDistanceKm: 5,
      page: 1,
      limit: 10,
      ...overrides,
    });

    beforeEach(() => {
      usersService.getPublicProfile.mockResolvedValue({
        id: 'driver-1',
        trustScore: { score: 72 },
        name: 'Nimal',
        verification: {
          identityStatus: 'verified',
          workplaceStatus: 'verified',
        },
      });
    });

    const mockFind = (rides: unknown[]) =>
      rideModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue(rides),
      });

    // 01:45Z = 07:15 Colombo, 03:30Z = 09:00 Colombo
    const goodRide = rideDoc({
      id: 'good',
      origin: { lat: 6.9, lng: 79.8 },
      departureTime: new Date('2099-01-05T01:45:00Z'),
    });
    const okRide = rideDoc({
      id: 'ok',
      origin: { lat: 6.92, lng: 79.8 },
      departureTime: new Date('2099-01-05T01:45:00Z'),
    });
    const lateRide = rideDoc({
      id: 'late',
      origin: { lat: 6.9, lng: 79.8 },
      departureTime: new Date('2099-01-05T03:30:00Z'),
    });

    it('asks for a home location before searching', async () => {
      usersService.findMe.mockResolvedValue(passenger(undefined));

      await expect(service.search('passenger-1', query())).rejects.toThrow(
        BadRequestException,
      );
      expect(rideModel.find).not.toHaveBeenCalled();
    });

    it('only looks at active rides from other drivers whose route passes near home', async () => {
      usersService.findMe.mockResolvedValue(passenger({ lat: 6.9, lng: 79.8 }));
      mockFind([]);

      await service.search('passenger-1', query({ maxDistanceKm: 3 }));

      expect(rideModel.find).toHaveBeenCalledWith({
        status: RideStatus.ACTIVE,
        driverId: { $ne: 'passenger-1' },
        seatsAvailable: { $gt: 0 },
        routeLine: {
          $geoIntersects: {
            $geometry: circlePolygon({ lat: 6.9, lng: 79.8 }, 3),
          },
        },
      });
    });

    it('sorts by match score, best first', async () => {
      usersService.findMe.mockResolvedValue(passenger({ lat: 6.9, lng: 79.8 }));
      mockFind([lateRide, okRide, goodRide]);

      const result = await service.search('passenger-1', query());

      expect(result.items.map((ride) => ride.id)).toEqual([
        'good',
        'ok',
        'late',
      ]);
      expect(result.items[0].match.score).toBeGreaterThan(
        result.items[1].match.score,
      );
    });

    it('adds the pickup distance and the driver to each result', async () => {
      usersService.findMe.mockResolvedValue(passenger({ lat: 6.9, lng: 79.8 }));
      mockFind([goodRide]);

      const result = await service.search('passenger-1', query());

      expect(result.items[0].pickupDistanceKm).toBe(0);
      expect(result.items[0].driver).toMatchObject({
        name: 'Nimal',
        trustScore: 72,
      });
    });

    it('only looks up drivers for rides on the current page', async () => {
      usersService.findMe.mockResolvedValue(passenger({ lat: 6.9, lng: 79.8 }));
      mockFind([lateRide, okRide, goodRide]);

      await service.search('passenger-1', query({ page: 1, limit: 2 }));

      expect(usersService.getPublicProfile).toHaveBeenCalledTimes(2);
    });

    it('pages the sorted results', async () => {
      usersService.findMe.mockResolvedValue(passenger({ lat: 6.9, lng: 79.8 }));
      mockFind([lateRide, okRide, goodRide]);

      const result = await service.search(
        'passenger-1',
        query({ page: 2, limit: 2 }),
      );

      expect(result.items.map((ride) => ride.id)).toEqual(['late']);
      expect(result).toMatchObject({ page: 2, limit: 2, total: 3 });
    });

    it('drops rides outside the departure time window', async () => {
      usersService.findMe.mockResolvedValue(passenger({ lat: 6.9, lng: 79.8 }));
      mockFind([goodRide, lateRide]);

      const result = await service.search(
        'passenger-1',
        query({ departAfter: '07:00', departBefore: '08:00' }),
      );

      expect(result.items.map((ride) => ride.id)).toEqual(['good']);
    });
  });

  describe('findOne', () => {
    it('returns the ride with my match score and the driver', async () => {
      rideModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(rideDoc()),
      });
      usersService.findMe.mockResolvedValue({ travelProfile: undefined });
      usersService.getPublicProfile.mockResolvedValue({
        id: 'driver-1',
        trustScore: { score: 72 },
        name: 'Nimal',
        role: 'driver',
        verification: {
          identityStatus: 'verified',
          workplaceStatus: 'verified',
        },
      });

      const result = await service.findOne(VEHICLE_ID, 'passenger-1');

      expect(usersService.getPublicProfile).toHaveBeenCalledWith(
        'driver-1',
        'passenger-1',
      );
      expect(result.match.score).toBe(0);
      expect(result.pickupDistanceKm).toBeNull();
      expect(result.driver).toEqual({
        id: 'driver-1',
        name: 'Nimal',
        photoUrl: undefined,
        verification: {
          identityStatus: 'verified',
          workplaceStatus: 'verified',
        },
        trustScore: 72,
      });
    });

    it('throws NotFoundException for a malformed id', async () => {
      await expect(service.findOne('not-an-id', 'passenger-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(rideModel.findById).not.toHaveBeenCalled();
    });
  });

  describe('reserveSeats', () => {
    it('only takes seats from an active ride that still has enough', async () => {
      const findOneAndUpdate = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(rideDoc()),
      });
      (
        rideModel as unknown as { findOneAndUpdate: jest.Mock }
      ).findOneAndUpdate = findOneAndUpdate;

      const reserved = await service.reserveSeats(VEHICLE_ID, 2);

      expect(findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: VEHICLE_ID,
          status: RideStatus.ACTIVE,
          seatsAvailable: { $gte: 2 },
        },
        { $inc: { seatsAvailable: -2 } },
      );
      expect(reserved).toBe(true);
    });

    it('returns false when the seats are already gone', async () => {
      (
        rideModel as unknown as { findOneAndUpdate: jest.Mock }
      ).findOneAndUpdate = jest
        .fn()
        .mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });

      await expect(service.reserveSeats(VEHICLE_ID, 2)).resolves.toBe(false);
    });
  });
});
