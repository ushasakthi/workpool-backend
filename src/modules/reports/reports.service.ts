import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import {
  AdminAction,
  ReportCategory,
  ReportStatus,
} from '../../common/constants';
import { AdminLogService } from '../admin-log/admin-log.service';
import { BookingsService } from '../bookings/bookings.service';
import { TrustScoreUpdater } from '../trust-score/trust-score.updater';
import { UsersService } from '../users/users.service';
import { Report, ReportDocument } from './schemas/report.schema';

export interface CreateReportInput {
  bookingId: string;
  category: ReportCategory;
  reason?: string;
}

export interface AdminReportView {
  id: string;
  bookingId: string;
  category: ReportCategory;
  reason?: string;
  status: ReportStatus;
  createdAt: Date;
  resolvedAt?: Date;
  // the reporter's details are for admins only
  reportedBy: { id: string; name: string; email: string };
  reportedUser: {
    id: string;
    name: string;
    role: 'passenger' | 'driver';
    // other reports against this person, any status
    otherReports: number;
  };
}

// There is deliberately no method that returns reports to a non-admin:
// the reported user must never see who reported them or why.
@Injectable()
export class ReportsService {
  constructor(
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    private readonly bookingsService: BookingsService,
    private readonly usersService: UsersService,
    private readonly trustScoreUpdater: TrustScoreUpdater,
    private readonly adminLogService: AdminLogService,
  ) {}

  async create(
    reporterId: string,
    input: CreateReportInput,
  ): Promise<{ id: string; status: ReportStatus }> {
    const parties = await this.bookingsService.getParties(input.bookingId);
    if (reporterId !== parties.passengerId && reporterId !== parties.driverId) {
      throw new ForbiddenException('You can only report your own rides');
    }

    const alreadyOpen = await this.reportModel
      .exists({
        bookingId: input.bookingId,
        reportedBy: reporterId,
        status: ReportStatus.OPEN,
      })
      .exec();
    if (alreadyOpen) {
      throw new ConflictException(
        'You already have an open report on this ride',
      );
    }

    const reportedRole =
      reporterId === parties.passengerId ? 'driver' : 'passenger';
    const reportedUser =
      reportedRole === 'driver' ? parties.driverId : parties.passengerId;

    const report = await new this.reportModel({
      reportedBy: reporterId,
      reportedUser,
      reportedRole,
      bookingId: input.bookingId,
      category: input.category,
      reason: input.reason,
      status: ReportStatus.OPEN,
    }).save();

    await this.trustScoreUpdater.recalculate(reportedUser);
    // only an acknowledgement goes back, not the stored report
    return { id: report.id, status: report.status };
  }

  // admin only (RolesGuard on the controller)
  async listForAdmin(status?: ReportStatus): Promise<AdminReportView[]> {
    // oldest first: it's a queue
    const reports = await this.reportModel
      .find(status ? { status } : {})
      .sort({ createdAt: 1 })
      .exec();
    const contacts = await this.usersService.findContacts(
      reports.flatMap((r) => [String(r.reportedBy), String(r.reportedUser)]),
    );

    // how often each reported person has been reported, to spot repeat issues
    const reportCounts = new Map<string, number>();
    for (const userId of new Set(reports.map((r) => String(r.reportedUser)))) {
      reportCounts.set(
        userId,
        await this.reportModel.countDocuments({ reportedUser: userId }).exec(),
      );
    }

    return reports.map((report) => {
      const reporter = contacts.get(String(report.reportedBy));
      const reported = contacts.get(String(report.reportedUser));
      return {
        id: report.id,
        bookingId: String(report.bookingId),
        category: report.category,
        reason: report.reason,
        status: report.status,
        createdAt: report.createdAt,
        resolvedAt: report.resolvedAt,
        reportedBy: {
          id: String(report.reportedBy),
          name: reporter?.name ?? 'Former user',
          email: reporter?.email ?? '',
        },
        reportedUser: {
          id: String(report.reportedUser),
          name: reported?.name ?? 'Former user',
          role: report.reportedRole,
          otherReports:
            (reportCounts.get(String(report.reportedUser)) ?? 1) - 1,
        },
      };
    });
  }

  // admin only (RolesGuard on the controller)
  async resolve(
    id: string,
    adminId: string,
    status: ReportStatus.REVIEWED | ReportStatus.DISMISSED,
  ): Promise<{ id: string; status: ReportStatus }> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException('Report not found');
    }

    const report = await this.reportModel
      .findByIdAndUpdate(
        id,
        { $set: { status, resolvedBy: adminId, resolvedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    await this.adminLogService.record({
      adminId,
      action:
        status === ReportStatus.REVIEWED
          ? AdminAction.REPORT_REVIEWED
          : AdminAction.REPORT_DISMISSED,
      targetUserId: String(report.reportedUser),
      reportId: id,
    });

    // a dismissed report stops counting as a complaint
    await this.trustScoreUpdater.recalculate(String(report.reportedUser));
    return { id: report.id, status: report.status };
  }
}
