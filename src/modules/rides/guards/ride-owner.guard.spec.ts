import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { UserRole } from '../../../common/constants';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { Ride } from '../schemas/ride.schema';
import { RideOwnerGuard } from './ride-owner.guard';

const DRIVER_ID = '5f9d88b8b54764421b7156c1';
const RIDE_ID = '5f9d88b8b54764421b7156c2';

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

describe('RideOwnerGuard', () => {
  let guard: RideOwnerGuard;
  let rideModel: { findById: jest.Mock };

  const mockLookup = (result: unknown) => {
    const exec = jest.fn().mockResolvedValue(result);
    rideModel.findById.mockReturnValue({
      select: () => ({ lean: () => ({ exec }) }),
    });
  };

  beforeEach(async () => {
    rideModel = { findById: jest.fn() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RideOwnerGuard,
        { provide: getModelToken(Ride.name), useValue: rideModel },
      ],
    }).compile();
    guard = module.get(RideOwnerGuard);
  });

  it('allows the ride owner through', async () => {
    mockLookup({ driverId: DRIVER_ID });
    await expect(
      guard.canActivate(contextFor({ id: RIDE_ID }, user(DRIVER_ID))),
    ).resolves.toBe(true);
  });

  it('allows an admin through', async () => {
    mockLookup({ driverId: DRIVER_ID });
    await expect(
      guard.canActivate(
        contextFor({ id: RIDE_ID }, user('other', UserRole.ADMIN)),
      ),
    ).resolves.toBe(true);
  });

  it('forbids a driver who is not the ride owner', async () => {
    mockLookup({ driverId: DRIVER_ID });
    await expect(
      guard.canActivate(contextFor({ id: RIDE_ID }, user('stranger'))),
    ).rejects.toThrow(ForbiddenException);
  });

  it('404s a missing ride', async () => {
    mockLookup(null);
    await expect(
      guard.canActivate(contextFor({ id: RIDE_ID }, user(DRIVER_ID))),
    ).rejects.toThrow(NotFoundException);
  });

  it('404s a malformed id without hitting the DB', async () => {
    await expect(
      guard.canActivate(contextFor({ id: 'nope' }, user(DRIVER_ID))),
    ).rejects.toThrow(NotFoundException);
    expect(rideModel.findById).not.toHaveBeenCalled();
  });
});
