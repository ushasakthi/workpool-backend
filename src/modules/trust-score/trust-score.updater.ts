import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BookingStatus,
  ReportStatus,
  VerificationStatus,
} from '../../common/constants';
import { Booking, BookingDocument } from '../bookings/schemas/booking.schema';
import { Report, ReportDocument } from '../reports/schemas/report.schema';
import { Review, ReviewDocument } from '../reviews/schemas/review.schema';
import { Ride, RideDocument } from '../rides/schemas/ride.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { complaintWeight, TrustScoreService } from './trust-score.service';

interface History {
  completedRides: number;
  ratingCount: number;
  averageRating: number;
  cancellationCount: number;
  complaintCount: number;
  upheldComplaints: number;
}

// Recounts a user's history from the real collections and caches a fresh
// score on User.trustScore. Recounting (instead of +1 / -1 counters) means
// the numbers can't drift if an event is missed.
@Injectable()
export class TrustScoreUpdater {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Ride.name) private readonly rideModel: Model<RideDocument>,
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Report.name)
    private readonly reportModel: Model<ReportDocument>,
    private readonly trustScoreService: TrustScoreService,
  ) {}

  async recalculate(userId: string): Promise<number | null> {
    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      return null;
    }

    const history = await this.countHistory(userId);
    const { score } = this.trustScoreService.calculate({
      identityVerified:
        user.verification?.identityStatus === VerificationStatus.VERIFIED,
      workplaceVerified:
        user.verification?.workplaceStatus === VerificationStatus.VERIFIED,
      ...history,
    });

    await this.userModel
      .updateOne(
        { _id: userId },
        { $set: { trustScore: { ...history, score, updatedAt: new Date() } } },
      )
      .exec();
    return score;
  }

  private async countHistory(userId: string): Promise<History> {
    const drivenRideIds = await this.rideModel
      .find({ driverId: userId })
      .distinct('_id')
      .exec();

    // as a passenger or as the driver
    const completedRides = await this.bookingModel
      .countDocuments({
        status: BookingStatus.COMPLETED,
        $or: [{ passengerId: userId }, { rideId: { $in: drivenRideIds } }],
      })
      .exec();

    // only cancelling an accepted booking counts (respondedAt is set on accept);
    // withdrawing a request the driver never answered is fine
    const cancellationCount = await this.bookingModel
      .countDocuments({
        status: BookingStatus.CANCELLED,
        cancelledBy: userId,
        respondedAt: { $exists: true },
      })
      .exec();

    // aggregate doesn't convert strings to ObjectIds, so do it here
    const [ratings] = await this.reviewModel
      .aggregate<{ count: number; average: number }>([
        { $match: { toUserId: new Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            average: { $avg: '$rating' },
          },
        },
      ])
      .exec();

    // dismissed reports weigh 0, upheld ones by severity
    const reports = await this.reportModel
      .find({ reportedUser: userId }, { status: 1, severity: 1 })
      .exec();
    const complaintCount = reports.reduce(
      (sum, report) => sum + complaintWeight(report.status, report.severity),
      0,
    );
    // open reports are left out so the count can't reveal a fresh report
    const upheldComplaints = reports.filter(
      (report) => report.status === ReportStatus.REVIEWED,
    ).length;

    return {
      completedRides,
      ratingCount: ratings?.count ?? 0,
      averageRating: ratings?.average ?? 0,
      cancellationCount,
      complaintCount,
      upheldComplaints,
    };
  }
}
