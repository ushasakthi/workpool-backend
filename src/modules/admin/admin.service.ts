import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import {
  AdminAction,
  BookingStatus,
  ReportStatus,
  RideStatus,
  SAFETY_REPORT_CATEGORIES,
  UserRole,
  VerificationStatus,
} from '../../common/constants';
import {
  AdminActionLog,
  AdminActionLogDocument,
} from '../admin-log/schemas/admin-action-log.schema';
import { AdminLogService } from '../admin-log/admin-log.service';
import { Booking, BookingDocument } from '../bookings/schemas/booking.schema';
import { Report, ReportDocument } from '../reports/schemas/report.schema';
import { Ride, RideDocument } from '../rides/schemas/ride.schema';
import { User, UserDocument } from '../users/schemas/user.schema';

export interface ListUsersInput {
  q?: string;
  role?: UserRole;
  status?: 'active' | 'suspended';
  verification?: 'verified' | 'pending';
  page: number;
  limit: number;
}

export interface AdminUserView {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  verification: {
    identityStatus: VerificationStatus;
    workplaceStatus: VerificationStatus;
    submitted: boolean;
  };
  trustScore: number | null;
  suspended: boolean;
  suspendedAt?: Date;
  suspensionReason?: string;
  createdAt: Date;
}

export interface AdminUsersPage {
  items: AdminUserView[];
  page: number;
  limit: number;
  // matching the filters
  total: number;
  // across everyone, for the "12 users · 1 suspended" line
  counts: { all: number; suspended: number };
}

export interface AdminStats {
  totalUsers: number;
  // kept for the existing home screen cards
  activePassengers: number;
  activeRiders: number;
  activeRides: number;
  completedRides: number;
  openReports: number;
  pendingVerifications: number;
  newUsersThisWeek: number;
  completedRidesThisMonth: number;
  openSafetyReports: number;
  // for "oldest submitted 2 days ago" on the queue cards, null when empty
  oldestPendingVerificationAt: Date | null;
  oldestOpenReportAt: Date | null;
}

export interface ActionLogEntryView {
  id: string;
  action: AdminAction;
  createdAt: Date;
  note?: string;
  reportId?: string;
  admin: { id: string; name: string };
  targetUser?: { id: string; name: string };
}

// submitted, and at least one check still waiting
const PENDING_VERIFICATION = {
  'verification.submittedAt': { $exists: true },
  $or: [
    { 'verification.identityStatus': VerificationStatus.PENDING },
    { 'verification.workplaceStatus': VerificationStatus.PENDING },
  ],
};

const FULLY_VERIFIED = {
  'verification.identityStatus': VerificationStatus.VERIFIED,
  'verification.workplaceStatus': VerificationStatus.VERIFIED,
};

const DAY_MS = 86_400_000;

// "a.b" in a search box should match the text "a.b", not "any character"
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Admin-only views across users, rides, bookings and reports. Reads the
// models directly (registered in AdminModule) rather than importing every module.
@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Ride.name) private readonly rideModel: Model<RideDocument>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    @InjectModel(AdminActionLog.name)
    private readonly logModel: Model<AdminActionLogDocument>,
    private readonly adminLogService: AdminLogService,
  ) {}

  async listUsers(input: ListUsersInput): Promise<AdminUsersPage> {
    // each condition is its own object so two $or's (search + pending) can't clash
    const conditions: Record<string, unknown>[] = [];
    if (input.q?.trim()) {
      const pattern = new RegExp(escapeRegex(input.q.trim()), 'i');
      conditions.push({ $or: [{ name: pattern }, { email: pattern }] });
    }
    if (input.verification === 'verified') {
      conditions.push(FULLY_VERIFIED);
    }
    if (input.verification === 'pending') {
      conditions.push(PENDING_VERIFICATION);
    }
    const filter: Record<string, unknown> =
      conditions.length > 0 ? { $and: conditions } : {};
    if (input.role) {
      filter.role = input.role;
    }
    if (input.status) {
      filter.suspended = input.status === 'suspended';
    }

    const [users, total, all, suspended] = await Promise.all([
      this.userModel
        .find(filter)
        .sort({ name: 1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit)
        .exec(),
      this.userModel.countDocuments(filter).exec(),
      this.userModel.countDocuments().exec(),
      this.userModel.countDocuments({ suspended: true }).exec(),
    ]);

    return {
      items: users.map(toAdminUserView),
      page: input.page,
      limit: input.limit,
      total,
      counts: { all, suspended },
    };
  }

  async setSuspended(
    userId: string,
    adminId: string,
    suspended: boolean,
    reason?: string,
  ): Promise<AdminUserView> {
    if (!isValidObjectId(userId)) {
      throw new NotFoundException('User not found');
    }
    if (suspended && !reason?.trim()) {
      throw new BadRequestException('A reason is required to suspend a user');
    }
    if (userId === adminId) {
      throw new BadRequestException("You can't suspend your own account");
    }
    const target = await this.userModel.findById(userId).exec();
    if (!target) {
      throw new NotFoundException('User not found');
    }
    if (target.role === UserRole.ADMIN) {
      throw new BadRequestException("Admin accounts can't be suspended");
    }

    const update = suspended
      ? {
          $set: {
            suspended: true,
            suspendedAt: new Date(),
            suspensionReason: reason,
          },
          // signs them out once their current access token is refused
          $unset: { refreshTokenHash: 1 },
        }
      : {
          $set: { suspended: false },
          $unset: { suspendedAt: 1, suspensionReason: 1 },
        };
    const user = await this.userModel
      .findByIdAndUpdate(userId, update, { returnDocument: 'after' })
      .exec();
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (suspended) {
      // so passengers stop finding their rides; the driver resumes them later
      await this.rideModel
        .updateMany(
          { driverId: userId, status: RideStatus.ACTIVE },
          { $set: { status: RideStatus.PAUSED } },
        )
        .exec();
    }

    await this.adminLogService.record({
      adminId,
      action: suspended
        ? AdminAction.USER_SUSPENDED
        : AdminAction.USER_UNSUSPENDED,
      targetUserId: userId,
      note: reason,
    });

    return toAdminUserView(user);
  }

  async getStats(): Promise<AdminStats> {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      activePassengers,
      activeRiders,
      activeRides,
      completedRides,
      openReports,
      pendingVerifications,
      newUsersThisWeek,
      completedRidesThisMonth,
      openSafetyReports,
      oldestPending,
      oldestReport,
    ] = await Promise.all([
      this.userModel.countDocuments({ role: { $ne: UserRole.ADMIN } }).exec(),
      this.userModel
        .countDocuments({ role: { $in: [UserRole.PASSENGER, UserRole.BOTH] } })
        .exec(),
      this.userModel
        .countDocuments({ role: { $in: [UserRole.DRIVER, UserRole.BOTH] } })
        .exec(),
      this.rideModel.countDocuments({ status: RideStatus.ACTIVE }).exec(),
      this.bookingModel
        .countDocuments({ status: BookingStatus.COMPLETED })
        .exec(),
      this.reportModel.countDocuments({ status: ReportStatus.OPEN }).exec(),
      this.userModel.countDocuments(PENDING_VERIFICATION).exec(),
      this.userModel
        .countDocuments({
          role: { $ne: UserRole.ADMIN },
          createdAt: { $gte: weekAgo },
        })
        .exec(),
      this.bookingModel
        .countDocuments({
          status: BookingStatus.COMPLETED,
          completedAt: { $gte: monthStart },
        })
        .exec(),
      this.reportModel
        .countDocuments({
          status: ReportStatus.OPEN,
          category: { $in: SAFETY_REPORT_CATEGORIES },
        })
        .exec(),
      this.userModel
        .findOne(PENDING_VERIFICATION)
        .sort({ 'verification.submittedAt': 1 })
        .select('verification.submittedAt')
        .exec(),
      this.reportModel
        .findOne({ status: ReportStatus.OPEN })
        .sort({ createdAt: 1 })
        .select('createdAt')
        .exec(),
    ]);

    return {
      totalUsers,
      activePassengers,
      activeRiders,
      activeRides,
      completedRides,
      openReports,
      pendingVerifications,
      newUsersThisWeek,
      completedRidesThisMonth,
      openSafetyReports,
      oldestPendingVerificationAt:
        oldestPending?.verification.submittedAt ?? null,
      oldestOpenReportAt: oldestReport?.createdAt ?? null,
    };
  }

  async listActionLog(limit: number): Promise<ActionLogEntryView[]> {
    const entries = await this.logModel
      .find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();

    const ids = entries.flatMap((e) =>
      e.targetUserId
        ? [String(e.adminId), String(e.targetUserId)]
        : [String(e.adminId)],
    );
    const users = await this.userModel
      .find({ _id: { $in: ids } })
      .select('name')
      .exec();
    const names = new Map(users.map((u) => [u.id, u.name]));
    const person = (id: unknown) => ({
      id: String(id),
      name: names.get(String(id)) ?? 'Former user',
    });

    return entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      createdAt: entry.createdAt,
      note: entry.note,
      reportId: entry.reportId ? String(entry.reportId) : undefined,
      admin: person(entry.adminId),
      targetUser: entry.targetUserId ? person(entry.targetUserId) : undefined,
    }));
  }
}

function toAdminUserView(user: UserDocument): AdminUserView {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    verification: {
      identityStatus: user.verification.identityStatus,
      workplaceStatus: user.verification.workplaceStatus,
      submitted: Boolean(user.verification.submittedAt),
    },
    trustScore: user.trustScore?.score ?? null,
    suspended: user.suspended === true,
    suspendedAt: user.suspendedAt,
    suspensionReason: user.suspensionReason,
    createdAt: (user as unknown as { createdAt: Date }).createdAt,
  };
}
