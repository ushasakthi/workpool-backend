import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BookingStatus, RideStatus } from '../../common/constants';
import { RidesService } from '../rides/rides.service';
import { serializeRide } from '../rides/serializers/ride.serializer';
import { TrustScoreUpdater } from '../trust-score/trust-score.updater';
import { UsersService } from '../users/users.service';
import { haversine } from '../rides/matching/smart-matching.service';
import { RideDocument } from '../rides/schemas/ride.schema';
import { BookingSide } from './dto/list-my-bookings-query.dto';
import {
  DriverSharing,
  driverSharing,
  monthRange,
  PassengerSavings,
  passengerSavings,
  SavingsTrip,
} from './savings/savings';
import { BookingParties, findBookingParties } from './guards/booking-parties';
import { Review, ReviewDocument } from '../reviews/schemas/review.schema';
import { Booking, BookingDocument } from './schemas/booking.schema';
import {
  BookingListItem,
  BookingView,
  serializeBooking,
} from './serializers/booking.serializer';

export interface SavingsView {
  month: string;
  isCurrentMonth: boolean;
  asPassenger: PassengerSavings;
  asDriver: DriverSharing;
}

export interface CreateBookingInput {
  rideId: string;
  seatsRequested: number;
}

// bookings that still hold (or are waiting for) a seat
const OPEN_STATUSES = [BookingStatus.REQUESTED, BookingStatus.ACCEPTED];

@Injectable()
export class BookingsService {
  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    private readonly ridesService: RidesService,
    private readonly usersService: UsersService,
    private readonly trustScoreUpdater: TrustScoreUpdater,
  ) {}

  async request(
    passengerId: string,
    input: CreateBookingInput,
  ): Promise<BookingView> {
    const ride = await this.ridesService.getRideOrThrow(input.rideId);

    if (ride.status !== RideStatus.ACTIVE) {
      throw new BadRequestException('This ride is not taking bookings');
    }
    if (String(ride.driverId) === passengerId) {
      throw new BadRequestException("You can't book your own ride");
    }
    if (input.seatsRequested > ride.seatsAvailable) {
      throw new BadRequestException(
        `Only ${ride.seatsAvailable} seat(s) left on this ride`,
      );
    }

    const alreadyBooked = await this.bookingModel
      .exists({
        rideId: input.rideId,
        passengerId,
        status: { $in: OPEN_STATUSES },
      })
      .exec();
    if (alreadyBooked) {
      throw new ConflictException('You already have a booking on this ride');
    }

    // seats are only taken when the driver accepts, not at request time
    const booking = await new this.bookingModel({
      rideId: input.rideId,
      passengerId,
      seatsRequested: input.seatsRequested,
      status: BookingStatus.REQUESTED,
      requestedAt: new Date(),
    }).save();
    return serializeBooking(booking);
  }

  async accept(id: string): Promise<BookingView> {
    // claim the request first, the status condition means it can only be answered once
    const booking = await this.bookingModel
      .findOneAndUpdate(
        { _id: id, status: BookingStatus.REQUESTED },
        { $set: { status: BookingStatus.ACCEPTED, respondedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!booking) {
      throw new ConflictException('Only pending requests can be accepted');
    }

    const reserved = await this.ridesService.reserveSeats(
      String(booking.rideId),
      booking.seatsRequested,
    );
    if (!reserved) {
      // no transactions on this database, so undo the claim by hand
      await this.bookingModel
        .updateOne(
          { _id: id },
          {
            $set: { status: BookingStatus.REQUESTED },
            $unset: { respondedAt: 1 },
          },
        )
        .exec();
      throw new ConflictException('Not enough seats left on this ride');
    }

    return serializeBooking(booking);
  }

  async reject(id: string): Promise<BookingView> {
    const booking = await this.bookingModel
      .findOneAndUpdate(
        { _id: id, status: BookingStatus.REQUESTED },
        { $set: { status: BookingStatus.REJECTED, respondedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!booking) {
      throw new ConflictException('Only pending requests can be rejected');
    }
    return serializeBooking(booking);
  }

  async cancel(id: string, cancelledBy: string): Promise<BookingView> {
    // 'before' so we know whether it was holding seats
    const booking = await this.bookingModel
      .findOneAndUpdate(
        { _id: id, status: { $in: OPEN_STATUSES } },
        { $set: { status: BookingStatus.CANCELLED, cancelledBy } },
        { returnDocument: 'before' },
      )
      .exec();
    if (!booking) {
      throw new ConflictException(
        'Only requested or accepted bookings can be cancelled',
      );
    }

    if (booking.status === BookingStatus.ACCEPTED) {
      await this.ridesService.releaseSeats(
        String(booking.rideId),
        booking.seatsRequested,
      );
      // backing out of an accepted booking lowers the canceller's Trust Score
      await this.trustScoreUpdater.recalculate(cancelledBy);
    }

    booking.status = BookingStatus.CANCELLED;
    return serializeBooking(booking);
  }

  async complete(id: string): Promise<BookingView> {
    const booking = await this.bookingModel
      .findOneAndUpdate(
        { _id: id, status: BookingStatus.ACCEPTED },
        { $set: { status: BookingStatus.COMPLETED, completedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!booking) {
      throw new ConflictException('Only accepted bookings can be completed');
    }

    // rides repeat every week, so the seat is free for the next booking
    const ride = await this.ridesService.getRideOrThrow(String(booking.rideId));
    await this.ridesService.releaseSeats(ride.id, booking.seatsRequested);

    // a completed ride counts towards both people's Trust Score
    await this.trustScoreUpdater.recalculate(String(booking.passengerId));
    await this.trustScoreUpdater.recalculate(String(ride.driverId));
    return serializeBooking(booking);
  }

  // one month of completed rides, from both sides (a "both" user can have both)
  async getSavings(userId: string, month?: string): Promise<SavingsView> {
    const range = monthRange(month);
    const completedInMonth = {
      status: BookingStatus.COMPLETED,
      completedAt: { $gte: range.start, $lt: range.end },
    };

    const asPassenger = await this.bookingModel
      .find({ ...completedInMonth, passengerId: userId })
      .exec();
    const asDriver = await this.bookingModel
      .find({
        ...completedInMonth,
        rideId: { $in: await this.ridesService.findRideIdsByDriver(userId) },
      })
      .exec();

    // the same ride repeats every week, so look each one up once
    const rides = new Map<string, Promise<RideDocument>>();
    const toTrip = async (booking: BookingDocument): Promise<SavingsTrip> => {
      const rideId = String(booking.rideId);
      if (!rides.has(rideId)) {
        rides.set(rideId, this.ridesService.getRideOrThrow(rideId));
      }
      const ride = await rides.get(rideId)!;
      return {
        distanceKm: haversine(ride.origin, ride.destination),
        contribution: ride.costContribution * booking.seatsRequested,
      };
    };

    return {
      month: range.month,
      isCurrentMonth: range.isCurrentMonth,
      asPassenger: passengerSavings(await Promise.all(asPassenger.map(toTrip))),
      asDriver: driverSharing(await Promise.all(asDriver.map(toTrip))),
    };
  }

  getParties(id: string): Promise<BookingParties> {
    return findBookingParties(id, this.bookingModel, this.ridesService);
  }

  async listMine(
    userId: string,
    side: BookingSide,
    status?: BookingStatus,
  ): Promise<BookingListItem[]> {
    const filter: Record<string, unknown> =
      side === BookingSide.DRIVER
        ? {
            rideId: {
              $in: await this.ridesService.findRideIdsByDriver(userId),
            },
          }
        : { passengerId: userId };
    if (status) {
      filter.status = status;
    }

    const bookings = await this.bookingModel
      .find(filter)
      .sort({ requestedAt: -1 })
      .exec();

    // one lookup per booking, fine for one user's list
    return Promise.all(
      bookings.map((booking) => this.toListItem(booking, side, userId)),
    );
  }

  private async toListItem(
    booking: BookingDocument,
    side: BookingSide,
    userId: string,
  ): Promise<BookingListItem> {
    const ride = await this.ridesService.getRideOrThrow(String(booking.rideId));
    const otherPartyId =
      side === BookingSide.DRIVER
        ? String(booking.passengerId)
        : String(ride.driverId);
    const other = await this.usersService.getPublicProfile(
      otherPartyId,
      userId,
    );
    const rideView = serializeRide(ride);

    return {
      ...serializeBooking(booking),
      ride: {
        origin: rideView.origin,
        destination: rideView.destination,
        departureTime: rideView.departureTime,
        daysOfWeek: rideView.daysOfWeek,
        seatsAvailable: rideView.seatsAvailable,
        costContribution: rideView.costContribution,
        status: rideView.status,
      },
      reviewedByMe: await this.hasReviewed(booking, userId),
      otherParty: {
        id: other.id,
        name: other.name,
        photoUrl: other.photoUrl,
        trustScore: other.trustScore.score,
      },
    };
  }

  private async hasReviewed(
    booking: BookingDocument,
    userId: string,
  ): Promise<boolean> {
    if (booking.status !== BookingStatus.COMPLETED) {
      return false;
    }
    const review = await this.reviewModel
      .exists({ bookingId: booking.id, fromUserId: userId })
      .exec();
    return review !== null;
  }
}
