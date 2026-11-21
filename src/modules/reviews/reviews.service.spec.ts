import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { BookingStatus } from '../../common/constants';
import { BookingsService } from '../bookings/bookings.service';
import { TrustScoreUpdater } from '../trust-score/trust-score.updater';
import { UsersService } from '../users/users.service';
import { ReviewsService } from './reviews.service';
import { Review } from './schemas/review.schema';

interface MockReviewModel {
  (doc: Record<string, unknown>): { save: jest.Mock };
  exists: jest.Mock;
  find: jest.Mock;
}

const BOOKING_ID = '5f9d88b8b54764421b7156c1';

const query = (value: unknown) => ({
  exec: jest.fn().mockResolvedValue(value),
});

describe('ReviewsService', () => {
  let service: ReviewsService;
  let reviewModel: MockReviewModel;
  let bookingsService: { getParties: jest.Mock };
  let usersService: { findNames: jest.Mock };
  let trustScoreUpdater: { recalculate: jest.Mock };
  let lastSaved: Record<string, unknown> | undefined;

  const completed = {
    status: BookingStatus.COMPLETED,
    passengerId: 'passenger-1',
    driverId: 'driver-1',
  };

  beforeEach(async () => {
    lastSaved = undefined;
    const ctor = jest.fn((doc: Record<string, unknown>) => {
      lastSaved = doc;
      return { save: jest.fn().mockResolvedValue({ id: 'review-1', ...doc }) };
    }) as unknown as MockReviewModel;
    ctor.exists = jest.fn().mockReturnValue(query(null));
    ctor.find = jest.fn();
    reviewModel = ctor;

    bookingsService = { getParties: jest.fn().mockResolvedValue(completed) };
    usersService = { findNames: jest.fn() };
    trustScoreUpdater = { recalculate: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewsService,
        { provide: getModelToken(Review.name), useValue: reviewModel },
        { provide: BookingsService, useValue: bookingsService },
        { provide: UsersService, useValue: usersService },
        { provide: TrustScoreUpdater, useValue: trustScoreUpdater },
      ],
    }).compile();

    service = module.get(ReviewsService);
  });

  describe('create', () => {
    const input = { bookingId: BOOKING_ID, rating: 5, comment: 'Great' };

    it('lets the passenger rate the driver, then updates the driver score', async () => {
      await service.create('passenger-1', input);

      expect(lastSaved).toMatchObject({
        fromUserId: 'passenger-1',
        toUserId: 'driver-1',
        fromRole: 'passenger',
        rating: 5,
      });
      expect(trustScoreUpdater.recalculate).toHaveBeenCalledWith('driver-1');
    });

    it('lets the driver rate the passenger', async () => {
      await service.create('driver-1', input);

      expect(lastSaved).toMatchObject({
        toUserId: 'passenger-1',
        fromRole: 'driver',
      });
    });

    it('refuses a booking that is not completed', async () => {
      bookingsService.getParties.mockResolvedValue({
        ...completed,
        status: BookingStatus.ACCEPTED,
      });

      await expect(service.create('passenger-1', input)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("refuses someone who wasn't on the booking", async () => {
      await expect(service.create('stranger', input)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('refuses a second review of the same booking', async () => {
      reviewModel.exists.mockReturnValue(query({ _id: 'review-0' }));

      await expect(service.create('passenger-1', input)).rejects.toThrow(
        ConflictException,
      );
      expect(trustScoreUpdater.recalculate).not.toHaveBeenCalled();
    });
  });

  describe('listForUser', () => {
    it("lists reviews about the user with each reviewer's name", async () => {
      const limit = jest.fn().mockReturnValue(
        query([
          {
            id: 'review-1',
            fromUserId: 'passenger-1',
            fromRole: 'passenger',
            rating: 4,
            comment: 'Fine',
            createdAt: new Date('2026-10-01'),
          },
        ]),
      );
      reviewModel.find.mockReturnValue({
        sort: () => ({ limit }),
      });
      usersService.findNames.mockResolvedValue(
        new Map([['passenger-1', 'Ushaa Saththi']]),
      );

      const result = await service.listForUser(BOOKING_ID);

      expect(reviewModel.find).toHaveBeenCalledWith({ toUserId: BOOKING_ID });
      expect(result[0]).toMatchObject({
        rating: 4,
        from: { id: 'passenger-1', firstName: 'Ushaa', role: 'passenger' },
      });
    });
  });
});
