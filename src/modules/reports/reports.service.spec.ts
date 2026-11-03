import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import {
  AdminAction,
  BookingStatus,
  ReportCategory,
  ReportStatus,
} from '../../common/constants';
import { BookingsService } from '../bookings/bookings.service';
import { AdminLogService } from '../admin-log/admin-log.service';
import { TrustScoreUpdater } from '../trust-score/trust-score.updater';
import { UsersService } from '../users/users.service';
import { ReportsService } from './reports.service';
import { Report } from './schemas/report.schema';

interface MockReportModel {
  (doc: Record<string, unknown>): { save: jest.Mock };
  exists: jest.Mock;
  find: jest.Mock;
  findByIdAndUpdate: jest.Mock;
  countDocuments: jest.Mock;
}

const BOOKING_ID = '5f9d88b8b54764421b7156c1';
const REPORT_ID = '5f9d88b8b54764421b7156c2';

const query = (value: unknown) => ({
  exec: jest.fn().mockResolvedValue(value),
});

describe('ReportsService', () => {
  let service: ReportsService;
  let reportModel: MockReportModel;
  let bookingsService: { getParties: jest.Mock };
  let usersService: { findContacts: jest.Mock };
  let trustScoreUpdater: { recalculate: jest.Mock };
  let adminLogService: { record: jest.Mock };
  let lastSaved: Record<string, unknown> | undefined;

  const input = {
    bookingId: BOOKING_ID,
    category: ReportCategory.NO_SHOW,
    reason: 'Never showed up',
  };

  beforeEach(async () => {
    lastSaved = undefined;
    const ctor = jest.fn((doc: Record<string, unknown>) => {
      lastSaved = doc;
      return { save: jest.fn().mockResolvedValue({ id: REPORT_ID, ...doc }) };
    }) as unknown as MockReportModel;
    ctor.exists = jest.fn().mockReturnValue(query(null));
    ctor.find = jest.fn();
    ctor.findByIdAndUpdate = jest.fn();
    ctor.countDocuments = jest.fn().mockReturnValue(query(3));
    reportModel = ctor;

    bookingsService = {
      getParties: jest.fn().mockResolvedValue({
        status: BookingStatus.ACCEPTED,
        passengerId: 'passenger-1',
        driverId: 'driver-1',
      }),
    };
    usersService = { findContacts: jest.fn() };
    trustScoreUpdater = { recalculate: jest.fn() };
    adminLogService = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getModelToken(Report.name), useValue: reportModel },
        { provide: BookingsService, useValue: bookingsService },
        { provide: UsersService, useValue: usersService },
        { provide: TrustScoreUpdater, useValue: trustScoreUpdater },
        { provide: AdminLogService, useValue: adminLogService },
      ],
    }).compile();

    service = module.get(ReportsService);
  });

  describe('create', () => {
    it('files an open report against the other person and updates their score', async () => {
      const result = await service.create('passenger-1', input);

      expect(lastSaved).toMatchObject({
        reportedBy: 'passenger-1',
        reportedUser: 'driver-1',
        reportedRole: 'driver',
        status: ReportStatus.OPEN,
      });
      expect(trustScoreUpdater.recalculate).toHaveBeenCalledWith('driver-1');
      // the reporter only gets an acknowledgement, not the stored report
      expect(result).toEqual({ id: REPORT_ID, status: ReportStatus.OPEN });
    });

    it("refuses someone who wasn't on the booking", async () => {
      await expect(service.create('stranger', input)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses a second open report on the same ride', async () => {
      reportModel.exists.mockReturnValue(query({ _id: 'report-0' }));

      await expect(service.create('passenger-1', input)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('resolve', () => {
    it('records the admin decision and updates the reported user score', async () => {
      reportModel.findByIdAndUpdate.mockReturnValue(
        query({
          id: REPORT_ID,
          reportedUser: 'driver-1',
          status: ReportStatus.DISMISSED,
        }),
      );

      const result = await service.resolve(
        REPORT_ID,
        'admin-1',
        ReportStatus.DISMISSED,
      );

      const [, update] = reportModel.findByIdAndUpdate.mock.calls[0] as [
        string,
        { $set: Record<string, unknown> },
      ];
      expect(update.$set).toMatchObject({
        status: ReportStatus.DISMISSED,
        resolvedBy: 'admin-1',
      });
      expect(trustScoreUpdater.recalculate).toHaveBeenCalledWith('driver-1');
      expect(adminLogService.record).toHaveBeenCalledWith({
        adminId: 'admin-1',
        action: AdminAction.REPORT_DISMISSED,
        targetUserId: 'driver-1',
        reportId: REPORT_ID,
      });
      expect(result.status).toBe(ReportStatus.DISMISSED);
    });

    it('404s on a malformed or unknown id', async () => {
      await expect(
        service.resolve('nope', 'admin-1', ReportStatus.REVIEWED),
      ).rejects.toThrow(NotFoundException);

      reportModel.findByIdAndUpdate.mockReturnValue(query(null));
      await expect(
        service.resolve(REPORT_ID, 'admin-1', ReportStatus.REVIEWED),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listForAdmin', () => {
    it('lists reports oldest first with reporter email and repeat count', async () => {
      const sort = jest.fn().mockReturnValue(
        query([
          {
            id: REPORT_ID,
            bookingId: BOOKING_ID,
            reportedBy: 'passenger-1',
            reportedUser: 'driver-1',
            reportedRole: 'driver',
            category: ReportCategory.NO_SHOW,
            reason: 'Never showed up',
            status: ReportStatus.OPEN,
            createdAt: new Date('2026-10-01'),
          },
        ]),
      );
      reportModel.find.mockReturnValue({ sort });
      usersService.findContacts.mockResolvedValue(
        new Map([
          ['passenger-1', { name: 'Ushaa', email: 'ushaa@x.com' }],
          ['driver-1', { name: 'Sakthiyaa', email: 'sak@x.com' }],
        ]),
      );

      const result = await service.listForAdmin(ReportStatus.OPEN);

      expect(sort).toHaveBeenCalledWith({ createdAt: 1 });
      expect(result[0]).toMatchObject({
        reportedBy: { name: 'Ushaa', email: 'ushaa@x.com' },
        reportedUser: { name: 'Sakthiyaa', role: 'driver', otherReports: 2 },
      });
    });

    it('filters by status', async () => {
      reportModel.find.mockReturnValue({
        sort: () =>
          query([
            {
              id: REPORT_ID,
              bookingId: BOOKING_ID,
              reportedBy: 'passenger-1',
              reportedUser: 'driver-1',
              category: ReportCategory.NO_SHOW,
              reason: 'Never showed up',
              status: ReportStatus.OPEN,
              createdAt: new Date('2026-10-01'),
            },
          ]),
      });
      usersService.findContacts.mockResolvedValue(new Map());

      await service.listForAdmin(ReportStatus.OPEN);

      expect(reportModel.find).toHaveBeenCalledWith({
        status: ReportStatus.OPEN,
      });
    });
  });
});
