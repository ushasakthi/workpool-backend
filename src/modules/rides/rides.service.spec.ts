import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { RideStatus, Weekday } from '../../common/constants';
import { VehiclesService } from '../vehicles/vehicles.service';
import { RidesService } from './rides.service';
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RidesService,
        { provide: getModelToken(Ride.name), useValue: rideModel },
        { provide: VehiclesService, useValue: vehiclesService },
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
});
