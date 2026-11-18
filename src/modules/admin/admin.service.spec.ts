import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import {
  AdminAction,
  ReportCategory,
  ReportSeverity,
  ReportStatus,
  RideStatus,
  UserRole,
  VerificationStatus,
} from '../../common/constants';
import { AdminLogService } from '../admin-log/admin-log.service';
import { AdminActionLog } from '../admin-log/schemas/admin-action-log.schema';
import { Booking } from '../bookings/schemas/booking.schema';
import { Report } from '../reports/schemas/report.schema';
import { Ride } from '../rides/schemas/ride.schema';
import { User } from '../users/schemas/user.schema';
import { Vehicle } from '../vehicles/schemas/vehicle.schema';
import { AdminService } from './admin.service';

const ADMIN_ID = '5f9d88b8b54764421b7156a0';
const USER_ID = '5f9d88b8b54764421b7156c1';

const query = (value: unknown) => ({
  exec: jest.fn().mockResolvedValue(value),
});

const userDoc = (overrides: Record<string, unknown> = {}) => ({
  id: USER_ID,
  name: 'Ushaa',
  email: 'ushaa@example.com',
  role: UserRole.PASSENGER,
  verification: {
    identityStatus: VerificationStatus.VERIFIED,
    workplaceStatus: VerificationStatus.VERIFIED,
    submittedAt: new Date('2026-09-01'),
  },
  trustScore: { score: 58 },
  suspended: false,
  createdAt: new Date('2026-08-01'),
  ...overrides,
});

describe('AdminService', () => {
  let service: AdminService;
  let userModel: {
    find: jest.Mock;
    findById: jest.Mock;
    findByIdAndUpdate: jest.Mock;
    countDocuments: jest.Mock;
    findOne: jest.Mock;
  };
  let rideModel: {
    updateMany: jest.Mock;
    countDocuments: jest.Mock;
    find: jest.Mock;
  };
  let bookingModel: { countDocuments: jest.Mock; find: jest.Mock };
  let vehicleModel: { find: jest.Mock };
  let reportModel: {
    countDocuments: jest.Mock;
    findOne: jest.Mock;
    find: jest.Mock;
  };
  let logModel: { find: jest.Mock };
  let adminLogService: { record: jest.Mock };

  beforeEach(async () => {
    userModel = {
      find: jest.fn(),
      findById: jest.fn().mockReturnValue(query(userDoc())),
      findByIdAndUpdate: jest.fn(),
      countDocuments: jest.fn().mockReturnValue(query(0)),
      findOne: jest.fn(),
    };
    rideModel = {
      updateMany: jest.fn().mockReturnValue(query({})),
      countDocuments: jest.fn().mockReturnValue(query(0)),
      find: jest.fn(),
    };
    bookingModel = {
      countDocuments: jest.fn().mockReturnValue(query(0)),
      find: jest.fn(),
    };
    vehicleModel = { find: jest.fn() };
    reportModel = {
      countDocuments: jest.fn().mockReturnValue(query(0)),
      findOne: jest.fn(),
      find: jest.fn().mockReturnValue({ sort: () => query([]) }),
    };
    logModel = { find: jest.fn() };
    adminLogService = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(Ride.name), useValue: rideModel },
        { provide: getModelToken(Booking.name), useValue: bookingModel },
        { provide: getModelToken(Report.name), useValue: reportModel },
        { provide: getModelToken(Vehicle.name), useValue: vehicleModel },
        { provide: getModelToken(AdminActionLog.name), useValue: logModel },
        { provide: AdminLogService, useValue: adminLogService },
      ],
    }).compile();

    service = module.get(AdminService);
  });

  describe('listUsers', () => {
    const sort = jest.fn();
    const mockFind = (users: unknown[]) => {
      const chain = {
        sort: (...args: unknown[]) => {
          sort(...args);
          return chain;
        },
        skip: () => chain,
        limit: () => query(users),
      };
      userModel.find.mockReturnValue(chain);
    };

    it('searches name or email literally, sorted by name, with overall counts', async () => {
      mockFind([userDoc()]);
      userModel.countDocuments
        .mockReturnValueOnce(query(1))
        .mockReturnValueOnce(query(12))
        .mockReturnValueOnce(query(1));

      const result = await service.listUsers({
        q: 'ush.a',
        role: UserRole.PASSENGER,
        status: 'active',
        page: 1,
        limit: 20,
      });

      const [filter] = userModel.find.mock.calls[0] as [
        {
          $and: [{ $or: { name: RegExp }[] }];
          role: UserRole;
          suspended: boolean;
        },
      ];
      expect(filter.$and[0].$or[0].name.source).toBe('ush\\.a');
      expect(filter.role).toBe(UserRole.PASSENGER);
      expect(filter.suspended).toBe(false);
      expect(sort).toHaveBeenCalledWith({ name: 1 });
      expect(result).toMatchObject({
        total: 1,
        page: 1,
        limit: 20,
        counts: { all: 12, suspended: 1 },
      });
      expect(result.items[0]).toMatchObject({
        name: 'Ushaa',
        trustScore: 58,
        verification: { submitted: true },
      });
    });

    it('filters pending verification without clobbering the search', async () => {
      mockFind([]);

      await service.listUsers({
        q: 'ush',
        verification: 'pending',
        page: 1,
        limit: 20,
      });

      const [filter] = userModel.find.mock.calls[0] as [{ $and: unknown[] }];
      expect(filter.$and).toHaveLength(2);
      expect(filter.$and[1]).toMatchObject({
        'verification.submittedAt': { $exists: true },
      });
    });

    it('never returns password or token fields', async () => {
      mockFind([userDoc({ passwordHash: 'secret', refreshTokenHash: 'x' })]);

      const { items } = await service.listUsers({ page: 1, limit: 20 });

      expect(items[0]).not.toHaveProperty('passwordHash');
      expect(items[0]).not.toHaveProperty('refreshTokenHash');
    });
  });

  describe('getUserDetail', () => {
    const RIDE_ID = '5f9d88b8b54764421b7156d1';
    const sortedLimited = (value: unknown[]) => ({
      sort: () => ({ limit: () => query(value) }),
    });
    const point = (label: string) => ({ lat: 6.9, lng: 79.8, label });
    const rideDoc = {
      id: RIDE_ID,
      driverId: 'driver',
      vehicleId: 'vehicle',
      origin: point('Home'),
      destination: point('Office'),
      departureTime: new Date('2026-11-01T08:00:00Z'),
      daysOfWeek: [],
      seatsAvailable: 3,
      costContribution: 400,
      status: RideStatus.ACTIVE,
    };

    it('returns the profile, emergency contact, vehicles and trips', async () => {
      userModel.find.mockReturnValue({ select: () => query([]) });
      userModel.findById.mockReturnValue(
        query(
          userDoc({
            phone: '+94771234567',
            travelProfile: {
              homeLocation: point('Home'),
              daysAvailable: [],
              hideWorkplaceName: false,
            },
            emergencyContact: { name: 'Amali', phone: '+94770000000' },
          }),
        ),
      );
      vehicleModel.find.mockReturnValue(
        query([
          {
            id: 'v1',
            ownerId: USER_ID,
            make: 'Toyota',
            model: 'Aqua',
            year: 2018,
            plateNumber: 'CAB-1234',
            seatsAvailable: 3,
            isActive: true,
          },
        ]),
      );
      rideModel.find
        .mockReturnValueOnce(sortedLimited([rideDoc]))
        .mockReturnValueOnce(query([rideDoc]));
      bookingModel.find.mockReturnValue(
        sortedLimited([
          {
            id: 'b1',
            rideId: RIDE_ID,
            status: 'completed',
            seatsRequested: 1,
            requestedAt: new Date('2026-10-30'),
            travelDate: '2026-11-02',
          },
          {
            id: 'b2',
            rideId: '5f9d88b8b54764421b7156ff',
            status: 'cancelled',
            seatsRequested: 1,
            requestedAt: new Date('2026-10-29'),
          },
        ]),
      );

      const result = await service.getUserDetail(USER_ID);

      expect(result).toMatchObject({
        name: 'Ushaa',
        phone: '+94771234567',
        emergencyContact: { name: 'Amali', phone: '+94770000000' },
        // exact, not fuzzed like other users see it
        travelProfile: { homeLocation: point('Home'), approximate: false },
      });
      expect(result.vehicles[0].plateNumber).toBe('CAB-1234');
      expect(result.ridesOffered[0].id).toBe(RIDE_ID);
      expect(result.ridesJoined[0].ride).toMatchObject({
        origin: point('Home'),
        costContribution: 400,
      });
      expect(result.ridesJoined[0].travelDate).toBe('2026-11-02');
      // the second booking's ride no longer exists
      expect(result.ridesJoined[1].ride).toBeNull();
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('lists reports against the user, open and decided, with who filed them', async () => {
      // rides offered, then the rides behind the joined bookings
      rideModel.find
        .mockReturnValueOnce(sortedLimited([]))
        .mockReturnValueOnce(query([]));
      bookingModel.find.mockReturnValue(sortedLimited([]));
      vehicleModel.find.mockReturnValue(query([]));
      reportModel.find.mockReturnValue({
        sort: () =>
          query([
            {
              id: 'r2',
              reportedBy: 'reporter-1',
              category: ReportCategory.LATE_PICKUP,
              status: ReportStatus.OPEN,
              createdAt: new Date('2026-11-18'),
            },
            {
              id: 'r1',
              reportedBy: 'reporter-1',
              category: ReportCategory.NO_SHOW,
              status: ReportStatus.REVIEWED,
              severity: ReportSeverity.MEDIUM,
              createdAt: new Date('2026-11-10'),
              resolvedAt: new Date('2026-11-11'),
            },
          ]),
      });
      userModel.find.mockReturnValue({
        select: () => query([{ id: 'reporter-1', name: 'Kamal' }]),
      });

      const result = await service.getUserDetail(USER_ID);

      expect(reportModel.find).toHaveBeenCalledWith({ reportedUser: USER_ID });
      expect(result.reportsAgainst).toEqual([
        expect.objectContaining({
          id: 'r2',
          status: ReportStatus.OPEN,
          reportedByName: 'Kamal',
        }),
        expect.objectContaining({
          id: 'r1',
          status: ReportStatus.REVIEWED,
          severity: ReportSeverity.MEDIUM,
        }),
      ]);
    });

    it('404s on an unknown or malformed id', async () => {
      await expect(service.getUserDetail('nope')).rejects.toThrow(
        NotFoundException,
      );
      userModel.findById.mockReturnValue(query(null));
      await expect(service.getUserDetail(USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('setSuspended', () => {
    it('suspends, signs the user out, pauses their rides and logs it', async () => {
      userModel.findByIdAndUpdate.mockReturnValue(
        query(userDoc({ suspended: true, suspensionReason: 'No-shows' })),
      );

      const result = await service.setSuspended(
        USER_ID,
        ADMIN_ID,
        true,
        'No-shows',
      );

      const [, update] = userModel.findByIdAndUpdate.mock.calls[0] as [
        string,
        { $set: Record<string, unknown>; $unset: Record<string, unknown> },
      ];
      expect(update.$set).toMatchObject({
        suspended: true,
        suspensionReason: 'No-shows',
      });
      expect(update.$unset).toEqual({ refreshTokenHash: 1 });
      expect(rideModel.updateMany).toHaveBeenCalledWith(
        { driverId: USER_ID, status: RideStatus.ACTIVE },
        { $set: { status: RideStatus.PAUSED } },
      );
      expect(adminLogService.record).toHaveBeenCalledWith({
        adminId: ADMIN_ID,
        action: AdminAction.USER_SUSPENDED,
        targetUserId: USER_ID,
        note: 'No-shows',
      });
      expect(result.suspended).toBe(true);
    });

    it('lifts a suspension without touching rides', async () => {
      userModel.findByIdAndUpdate.mockReturnValue(query(userDoc()));

      await service.setSuspended(USER_ID, ADMIN_ID, false);

      expect(rideModel.updateMany).not.toHaveBeenCalled();
      expect(adminLogService.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: AdminAction.USER_UNSUSPENDED }),
      );
    });

    it('needs a reason to suspend', async () => {
      await expect(
        service.setSuspended(USER_ID, ADMIN_ID, true, '  '),
      ).rejects.toThrow('A reason is required to suspend a user');
    });

    it("won't let an admin suspend themselves", async () => {
      await expect(
        service.setSuspended(ADMIN_ID, ADMIN_ID, true, 'x'),
      ).rejects.toThrow(BadRequestException);
    });

    it("won't suspend another admin", async () => {
      userModel.findById.mockReturnValue(
        query(userDoc({ role: UserRole.ADMIN })),
      );

      await expect(
        service.setSuspended(USER_ID, ADMIN_ID, true, 'x'),
      ).rejects.toThrow(BadRequestException);
      expect(adminLogService.record).not.toHaveBeenCalled();
    });

    it('404s on an unknown or malformed id', async () => {
      await expect(
        service.setSuspended('nope', ADMIN_ID, true, 'x'),
      ).rejects.toThrow(NotFoundException);

      userModel.findById.mockReturnValue(query(null));
      await expect(
        service.setSuspended(USER_ID, ADMIN_ID, true, 'x'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStats', () => {
    it('returns every dashboard count', async () => {
      userModel.countDocuments.mockReturnValue(query(7));
      rideModel.countDocuments.mockReturnValue(query(2));
      bookingModel.countDocuments.mockReturnValue(query(5));
      reportModel.countDocuments.mockReturnValue(query(1));
      const submittedAt = new Date('2026-10-20');
      const filedAt = new Date('2026-10-19');
      userModel.findOne.mockReturnValue({
        sort: () => ({
          select: () => query({ verification: { submittedAt } }),
        }),
      });
      reportModel.findOne.mockReturnValue({
        sort: () => ({ select: () => query({ createdAt: filedAt }) }),
      });

      const stats = await service.getStats();

      expect(stats).toEqual({
        totalUsers: 7,
        activePassengers: 7,
        activeRiders: 7,
        activeRides: 2,
        completedRides: 5,
        openReports: 1,
        pendingVerifications: 7,
        newUsersThisWeek: 7,
        completedRidesThisMonth: 5,
        openSafetyReports: 1,
        oldestPendingVerificationAt: submittedAt,
        oldestOpenReportAt: filedAt,
      });
    });

    it('reports empty queues as null', async () => {
      userModel.findOne.mockReturnValue({
        sort: () => ({ select: () => query(null) }),
      });
      reportModel.findOne.mockReturnValue({
        sort: () => ({ select: () => query(null) }),
      });

      const stats = await service.getStats();

      expect(stats.oldestPendingVerificationAt).toBeNull();
      expect(stats.oldestOpenReportAt).toBeNull();
    });
  });

  describe('listActionLog', () => {
    it('lists entries newest first with admin and target names', async () => {
      const limit = jest.fn().mockReturnValue(
        query([
          {
            id: 'log-1',
            adminId: ADMIN_ID,
            action: AdminAction.USER_SUSPENDED,
            targetUserId: USER_ID,
            note: 'No-shows',
            createdAt: new Date('2026-10-26'),
          },
        ]),
      );
      const sort = jest.fn().mockReturnValue({ limit });
      logModel.find.mockReturnValue({ sort });
      userModel.find.mockReturnValue({
        select: () =>
          query([
            { id: ADMIN_ID, name: 'WorkPool Admin' },
            { id: USER_ID, name: 'Ushaa' },
          ]),
      });

      const [entry] = await service.listActionLog(50);

      expect(sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(limit).toHaveBeenCalledWith(50);
      expect(entry).toMatchObject({
        action: AdminAction.USER_SUSPENDED,
        admin: { name: 'WorkPool Admin' },
        targetUser: { name: 'Ushaa' },
      });
    });
  });
});
