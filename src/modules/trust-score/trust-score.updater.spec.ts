import { Model } from 'mongoose';
import {
  BookingStatus,
  ReportStatus,
  VerificationStatus,
} from '../../common/constants';
import { BookingDocument } from '../bookings/schemas/booking.schema';
import { ReportDocument } from '../reports/schemas/report.schema';
import { ReviewDocument } from '../reviews/schemas/review.schema';
import { RideDocument } from '../rides/schemas/ride.schema';
import { UserDocument } from '../users/schemas/user.schema';
import { TrustScoreService } from './trust-score.service';
import { TrustScoreUpdater } from './trust-score.updater';

const USER_ID = '5f9d88b8b54764421b7156c1';

const query = (value: unknown) => ({
  exec: jest.fn().mockResolvedValue(value),
});

describe('TrustScoreUpdater', () => {
  let userModel: { findById: jest.Mock; updateOne: jest.Mock };
  let rideModel: { find: jest.Mock };
  let bookingModel: { countDocuments: jest.Mock };
  let reviewModel: { aggregate: jest.Mock };
  let reportModel: { countDocuments: jest.Mock };
  let updater: TrustScoreUpdater;

  beforeEach(() => {
    userModel = {
      findById: jest.fn().mockReturnValue(
        query({
          verification: {
            identityStatus: VerificationStatus.VERIFIED,
            workplaceStatus: VerificationStatus.VERIFIED,
          },
        }),
      ),
      updateOne: jest.fn().mockReturnValue(query({})),
    };
    rideModel = {
      find: jest
        .fn()
        .mockReturnValue({ distinct: () => query(['ride-1', 'ride-2']) }),
    };
    // 1st call: completed rides, 2nd call: cancellations
    bookingModel = {
      countDocuments: jest
        .fn()
        .mockReturnValueOnce(query(10))
        .mockReturnValueOnce(query(1)),
    };
    reviewModel = {
      aggregate: jest.fn().mockReturnValue(query([{ count: 8, average: 4.6 }])),
    };
    reportModel = { countDocuments: jest.fn().mockReturnValue(query(0)) };

    updater = new TrustScoreUpdater(
      userModel as unknown as Model<UserDocument>,
      rideModel as unknown as Model<RideDocument>,
      bookingModel as unknown as Model<BookingDocument>,
      reviewModel as unknown as Model<ReviewDocument>,
      reportModel as unknown as Model<ReportDocument>,
      new TrustScoreService(),
    );
  });

  it('recounts the history and stores the worked-example score (85)', async () => {
    const score = await updater.recalculate(USER_ID);

    expect(score).toBe(85);
    const [filter, update] = userModel.updateOne.mock.calls[0] as [
      unknown,
      { $set: { trustScore: Record<string, unknown> } },
    ];
    expect(filter).toEqual({ _id: USER_ID });
    expect(update.$set.trustScore).toMatchObject({
      completedRides: 10,
      ratingCount: 8,
      averageRating: 4.6,
      cancellationCount: 1,
      complaintCount: 0,
      score: 85,
    });
  });

  it('counts completed rides as passenger or as driver', async () => {
    await updater.recalculate(USER_ID);

    expect(bookingModel.countDocuments).toHaveBeenNthCalledWith(1, {
      status: BookingStatus.COMPLETED,
      $or: [
        { passengerId: USER_ID },
        { rideId: { $in: ['ride-1', 'ride-2'] } },
      ],
    });
  });

  it('only counts cancellations of accepted bookings by this user', async () => {
    await updater.recalculate(USER_ID);

    expect(bookingModel.countDocuments).toHaveBeenNthCalledWith(2, {
      status: BookingStatus.CANCELLED,
      cancelledBy: USER_ID,
      respondedAt: { $exists: true },
    });
  });

  it('ignores dismissed reports', async () => {
    await updater.recalculate(USER_ID);

    expect(reportModel.countDocuments).toHaveBeenCalledWith({
      reportedUser: USER_ID,
      status: { $ne: ReportStatus.DISMISSED },
    });
  });

  it('treats no reviews as no ratings yet', async () => {
    reviewModel.aggregate.mockReturnValue(query([]));

    await updater.recalculate(USER_ID);

    const [, update] = userModel.updateOne.mock.calls[0] as [
      unknown,
      { $set: { trustScore: Record<string, unknown> } },
    ];
    expect(update.$set.trustScore).toMatchObject({
      ratingCount: 0,
      averageRating: 0,
    });
  });

  it('does nothing for a user that no longer exists', async () => {
    userModel.findById.mockReturnValue(query(null));

    await expect(updater.recalculate(USER_ID)).resolves.toBeNull();
    expect(userModel.updateOne).not.toHaveBeenCalled();
  });
});
