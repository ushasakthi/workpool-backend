import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { BookingStatus } from '../../common/constants';
import { BookingsService } from '../bookings/bookings.service';
import { TrustScoreUpdater } from '../trust-score/trust-score.updater';
import { UsersService } from '../users/users.service';
import { Review, ReviewDocument } from './schemas/review.schema';

export interface CreateReviewInput {
  bookingId: string;
  rating: number;
  comment?: string;
}

export interface ReviewView {
  id: string;
  rating: number;
  comment?: string;
  createdAt: Date;
  // first name only, as the review screen promises
  from: { id: string; firstName: string; role: 'passenger' | 'driver' };
}

const REVIEWS_SHOWN = 50;

@Injectable()
export class ReviewsService {
  constructor(
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    private readonly bookingsService: BookingsService,
    private readonly usersService: UsersService,
    private readonly trustScoreUpdater: TrustScoreUpdater,
  ) {}

  async create(
    fromUserId: string,
    input: CreateReviewInput,
  ): Promise<{ id: string }> {
    const parties = await this.bookingsService.getParties(input.bookingId);

    // only people who actually shared the ride, and only once it happened
    if (fromUserId !== parties.passengerId && fromUserId !== parties.driverId) {
      throw new ForbiddenException('You can only review your own rides');
    }
    if (parties.status !== BookingStatus.COMPLETED) {
      throw new BadRequestException('You can only review a completed ride');
    }

    const alreadyReviewed = await this.reviewModel
      .exists({ bookingId: input.bookingId, fromUserId })
      .exec();
    if (alreadyReviewed) {
      throw new ConflictException('You already reviewed this ride');
    }

    // you review the other person on the booking
    const fromRole =
      fromUserId === parties.passengerId ? 'passenger' : 'driver';
    const toUserId =
      fromRole === 'passenger' ? parties.driverId : parties.passengerId;

    const review = await new this.reviewModel({
      bookingId: input.bookingId,
      fromUserId,
      toUserId,
      fromRole,
      rating: input.rating,
      comment: input.comment,
    }).save();

    await this.trustScoreUpdater.recalculate(toUserId);
    return { id: review.id };
  }

  async listForUser(userId: string): Promise<ReviewView[]> {
    if (!isValidObjectId(userId)) {
      throw new NotFoundException('User not found');
    }

    const reviews = await this.reviewModel
      .find({ toUserId: userId })
      .sort({ createdAt: -1 })
      .limit(REVIEWS_SHOWN)
      .exec();
    const names = await this.usersService.findNames(
      reviews.map((review) => String(review.fromUserId)),
    );

    return reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt,
      from: {
        id: String(review.fromUserId),
        firstName: (names.get(String(review.fromUserId)) ?? 'Former').split(
          ' ',
        )[0],
        role: review.fromRole,
      },
    }));
  }
}
