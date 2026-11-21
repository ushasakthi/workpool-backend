import { resolve } from 'path';
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getModelToken } from '@nestjs/mongoose';
import { VehiclesService } from './vehicles.service';
import { Vehicle } from './schemas/vehicle.schema';

interface MockVehicleModel {
  (doc: Record<string, unknown>): { save: jest.Mock };
  find: jest.Mock;
  findById: jest.Mock;
  findByIdAndUpdate: jest.Mock;
}

describe('VehiclesService', () => {
  let service: VehiclesService;
  let vehicleModel: MockVehicleModel;
  let lastSaved: Record<string, unknown> | undefined;

  const vehiclePhotoDir = '/tmp/vehicle-photos';

  const baseDoc = (overrides: Record<string, unknown> = {}) => ({
    id: 'vehicle-1',
    ownerId: 'owner-1',
    make: 'Toyota',
    model: 'Aqua',
    year: 2018,
    plateNumber: 'CAB-1234',
    seatsAvailable: 3,
    isActive: true,
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  });

  beforeEach(async () => {
    lastSaved = undefined;
    const ctor = jest.fn((doc: Record<string, unknown>) => {
      lastSaved = doc;
      return { save: jest.fn().mockResolvedValue(baseDoc(doc)) };
    }) as unknown as MockVehicleModel;
    ctor.find = jest.fn();
    ctor.findById = jest.fn();
    ctor.findByIdAndUpdate = jest.fn();
    vehicleModel = ctor;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesService,
        { provide: getModelToken(Vehicle.name), useValue: vehicleModel },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) =>
              key === 'uploads' ? { vehiclePhotoDir } : undefined,
            ),
          },
        },
      ],
    }).compile();

    service = module.get(VehiclesService);
  });

  describe('create', () => {
    it('persists the vehicle with the owner id attached', async () => {
      const result = await service.create('owner-1', {
        make: 'Toyota',
        model: 'Aqua',
        year: 2018,
        plateNumber: 'CAB-1234',
        seatsAvailable: 3,
      });

      expect(lastSaved).toMatchObject({ ownerId: 'owner-1', make: 'Toyota' });
      expect(result).toMatchObject({
        id: 'vehicle-1',
        ownerId: 'owner-1',
        seatsAvailable: 3,
      });
      expect(result.photoUrl).toBeUndefined();
    });
  });

  describe('findMine', () => {
    it('filters by owner, newest first, and serialises each row', async () => {
      const execMock = jest
        .fn()
        .mockResolvedValue([baseDoc(), baseDoc({ id: 'vehicle-2' })]);
      const sortMock = jest.fn().mockReturnValue({ exec: execMock });
      vehicleModel.find.mockReturnValue({ sort: sortMock });

      const result = await service.findMine('owner-1');

      expect(vehicleModel.find).toHaveBeenCalledWith({ ownerId: 'owner-1' });
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('vehicle-1');
    });
  });

  describe('update', () => {
    it('builds a $set from the provided keys only and returns the updated view', async () => {
      const execMock = jest
        .fn()
        .mockResolvedValue(baseDoc({ seatsAvailable: 4 }));
      vehicleModel.findByIdAndUpdate.mockReturnValue({ exec: execMock });

      const result = await service.update('vehicle-1', {
        seatsAvailable: 4,
        make: undefined,
      });

      const [id, update] = vehicleModel.findByIdAndUpdate.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(id).toBe('vehicle-1');
      expect(update).toEqual({ $set: { seatsAvailable: 4 } });
      expect(result.seatsAvailable).toBe(4);
    });

    it('retires a vehicle by setting isActive false', async () => {
      const execMock = jest
        .fn()
        .mockResolvedValue(baseDoc({ isActive: false }));
      vehicleModel.findByIdAndUpdate.mockReturnValue({ exec: execMock });

      const result = await service.update('vehicle-1', { isActive: false });

      const [, update] = vehicleModel.findByIdAndUpdate.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(update).toEqual({ $set: { isActive: false } });
      expect(result.isActive).toBe(false);
    });

    it('sends no $set operator when the body has nothing to change', async () => {
      const execMock = jest.fn().mockResolvedValue(baseDoc());
      vehicleModel.findByIdAndUpdate.mockReturnValue({ exec: execMock });

      await service.update('vehicle-1', {});

      const [, update] = vehicleModel.findByIdAndUpdate.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(update).toEqual({});
    });

    it('throws NotFoundException when the vehicle does not exist', async () => {
      vehicleModel.findByIdAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.update('missing', { seatsAvailable: 2 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updatePhoto', () => {
    it('stores the uploaded filename on photoUrl', async () => {
      const execMock = jest
        .fn()
        .mockResolvedValue(baseDoc({ photoUrl: 'abc.jpg' }));
      vehicleModel.findByIdAndUpdate.mockReturnValue({ exec: execMock });

      const result = await service.updatePhoto('vehicle-1', 'abc.jpg');

      const [, update] = vehicleModel.findByIdAndUpdate.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(update).toEqual({ $set: { photoUrl: 'abc.jpg' } });
      expect(result.photoUrl).toBe(
        `/vehicles/vehicle-1/photo?v=${new Date(
          '2026-01-01T00:00:00Z',
        ).getTime()}`,
      );
    });
  });

  describe('resolveVehiclePhotoPath', () => {
    const objectId = '5f9d88b8b54764421b7156c1';

    it('resolves the absolute path under the configured dir', async () => {
      vehicleModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ photoUrl: 'abc.jpg' }),
      });

      const result = await service.resolveVehiclePhotoPath(objectId);

      expect(result).toBe(resolve(vehiclePhotoDir, 'abc.jpg'));
    });

    it('rejects a non-ObjectId before touching the DB', async () => {
      await expect(
        service.resolveVehiclePhotoPath('not-an-id'),
      ).rejects.toThrow(NotFoundException);
      expect(vehicleModel.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the vehicle has no photo', async () => {
      vehicleModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ photoUrl: undefined }),
      });

      await expect(service.resolveVehiclePhotoPath(objectId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findOwnedVehicleOrThrow', () => {
    const objectId = '5f9d88b8b54764421b7156c1';

    it('returns the vehicle when it exists and belongs to the caller', async () => {
      vehicleModel.findById.mockReturnValue({
        exec: jest
          .fn()
          .mockResolvedValue(
            baseDoc({ ownerId: 'owner-1', seatsAvailable: 4 }),
          ),
      });

      const vehicle = await service.findOwnedVehicleOrThrow(
        objectId,
        'owner-1',
      );

      expect(vehicle.seatsAvailable).toBe(4);
    });

    it('throws NotFoundException for a vehicle owned by someone else', async () => {
      vehicleModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(baseDoc({ ownerId: 'someone-else' })),
      });

      await expect(
        service.findOwnedVehicleOrThrow(objectId, 'owner-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException for a malformed id without hitting the DB', async () => {
      await expect(
        service.findOwnedVehicleOrThrow('not-an-id', 'owner-1'),
      ).rejects.toThrow(NotFoundException);
      expect(vehicleModel.findById).not.toHaveBeenCalled();
    });
  });
});
