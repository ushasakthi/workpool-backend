import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UserRole } from '../../../common/constants';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { Vehicle } from '../schemas/vehicle.schema';
import { VehicleOwnerGuard } from './vehicle-owner.guard';

const OWNER_ID = '5f9d88b8b54764421b7156c1';
const VEHICLE_ID = '5f9d88b8b54764421b7156c2';

function contextFor(
  params: Record<string, string>,
  user?: AuthenticatedUser,
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ params, user }) }),
  } as unknown as ExecutionContext;
}

const user = (id: string, role = UserRole.DRIVER): AuthenticatedUser => ({
  userId: id,
  email: `${id}@example.com`,
  role,
});

describe('VehicleOwnerGuard', () => {
  let guard: VehicleOwnerGuard;
  let vehicleModel: { findById: jest.Mock };

  const mockLookup = (result: unknown) => {
    const exec = jest.fn().mockResolvedValue(result);
    vehicleModel.findById.mockReturnValue({
      select: () => ({ lean: () => ({ exec }) }),
    });
  };

  beforeEach(async () => {
    vehicleModel = { findById: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehicleOwnerGuard,
        { provide: getModelToken(Vehicle.name), useValue: vehicleModel },
      ],
    }).compile();
    guard = module.get(VehicleOwnerGuard);
  });

  it('allows the owner through', async () => {
    mockLookup({ ownerId: OWNER_ID });
    await expect(
      guard.canActivate(contextFor({ id: VEHICLE_ID }, user(OWNER_ID))),
    ).resolves.toBe(true);
  });

  it('allows an admin through regardless of ownership', async () => {
    mockLookup({ ownerId: OWNER_ID });
    await expect(
      guard.canActivate(
        contextFor({ id: VEHICLE_ID }, user('someone-else', UserRole.ADMIN)),
      ),
    ).resolves.toBe(true);
  });

  it('forbids a non-owner', async () => {
    mockLookup({ ownerId: OWNER_ID });
    await expect(
      guard.canActivate(contextFor({ id: VEHICLE_ID }, user('stranger'))),
    ).rejects.toThrow(ForbiddenException);
  });

  it('404s a missing vehicle', async () => {
    mockLookup(null);
    await expect(
      guard.canActivate(contextFor({ id: VEHICLE_ID }, user(OWNER_ID))),
    ).rejects.toThrow(NotFoundException);
  });

  it('404s a malformed id without hitting the DB', async () => {
    await expect(
      guard.canActivate(contextFor({ id: 'not-an-id' }, user(OWNER_ID))),
    ).rejects.toThrow(NotFoundException);
    expect(vehicleModel.findById).not.toHaveBeenCalled();
  });

  it('denies an unauthenticated request', async () => {
    await expect(
      guard.canActivate(contextFor({ id: VEHICLE_ID })),
    ).resolves.toBe(false);
  });
});
