import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BookingStatus, RideStatus } from '../../common/constants';
import { AppConfig } from '../../config/configuration';
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
import { BookingNotifier } from './notifications/booking-notifier';
import { isWithinPickupWindow } from './pickup-window';
import {
  colomboDateString,
  isValidTravelDate,
  upcomingTravelDates,
} from './travel-date';
import { Review, ReviewDocument } from '../reviews/schemas/review.schema';
import { Trip, TripDocument } from '../trips/schemas/trip.schema';
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

export interface TravelDayView {
  // "2026-11-18"
  date: string;
  seatsLeft: number;
}

export interface CreateBookingInput {
  rideId: string;
  seatsRequested: number;
  travelDate: string;
}

// bookings that still hold (or are waiting for) a seat
const OPEN_STATUSES = [BookingStatus.REQUESTED, BookingStatus.ACCEPTED];

// "0000"-"9999", crypto so it can't be guessed from earlier PINs
export function generatePickupPin(): string {
  return String(randomInt(0, 10000)).padStart(4, '0');
}

@Injectable()
export class BookingsService {
  constructor(
    @InjectModel(Booking.name)
    private readonly bookingModel: Model<BookingDocument>,
    @InjectModel(Review.name)
    private readonly reviewModel: Model<ReviewDocument>,
    @InjectModel(Trip.name)
    private readonly tripModel: Model<TripDocument>,
    private readonly ridesService: RidesService,
    private readonly usersService: UsersService,
    private readonly trustScoreUpdater: TrustScoreUpdater,
    private readonly notifier: BookingNotifier,
    private readonly configService: ConfigService<AppConfig, true>,
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
    if (!isValidTravelDate(ride, input.travelDate, new Date())) {
      throw new BadRequestException(
        'Pick a day this ride runs, within the next 7 days',
      );
    }
    if (await this.tripStarted(input.rideId, input.travelDate)) {
      throw new BadRequestException('This ride has already left that day');
    }
    const taken = await this.seatsTaken(input.rideId, input.travelDate);
    const seatsLeft = ride.seatsAvailable - taken;
    if (input.seatsRequested > seatsLeft) {
      throw new BadRequestException(
        `Only ${seatsLeft} seat(s) left on this ride for that day`,
      );
    }

    const alreadyBooked = await this.bookingModel
      .exists({
        rideId: input.rideId,
        passengerId,
        travelDate: input.travelDate,
        status: { $in: OPEN_STATUSES },
      })
      .exec();
    if (alreadyBooked) {
      throw new ConflictException(
        'You already have a booking on this ride for that day',
      );
    }

    // seats only count once the driver accepts, not at request time
    const booking = await new this.bookingModel({
      rideId: input.rideId,
      passengerId,
      seatsRequested: input.seatsRequested,
      travelDate: input.travelDate,
      status: BookingStatus.REQUESTED,
      requestedAt: new Date(),
    }).save();
    await this.notifier.requested(booking);
    return serializeBooking(booking);
  }

  async accept(id: string): Promise<BookingView> {
    // claim the request first, the status condition means it can only be answered once
    const booking = await this.bookingModel
      .findOneAndUpdate(
        { _id: id, status: BookingStatus.REQUESTED },
        {
          $set: {
            status: BookingStatus.ACCEPTED,
            respondedAt: new Date(),
            pickupPin: generatePickupPin(),
          },
        },
        { returnDocument: 'after' },
      )
      .exec();
    if (!booking) {
      throw new ConflictException('Only pending requests can be accepted');
    }

    // counted after the claim, so two accepts at once see each other and can't overbook
    const ride = await this.ridesService.getRideOrThrow(String(booking.rideId));
    const taken = await this.seatsTaken(
      String(booking.rideId),
      booking.travelDate,
    );
    if (ride.status !== RideStatus.ACTIVE || taken > ride.seatsAvailable) {
      // no transactions on this database, so undo the claim by hand
      await this.bookingModel
        .updateOne(
          { _id: id },
          {
            $set: { status: BookingStatus.REQUESTED },
            $unset: { respondedAt: 1, pickupPin: 1 },
          },
        )
        .exec();
      throw new ConflictException(
        'Not enough seats left on this ride for that day',
      );
    }

    await this.notifier.answered(booking, true);
    return serializeBooking(booking);
  }

  // the days a passenger can book this ride for, with seats left on each
  async listTravelDays(rideId: string): Promise<TravelDayView[]> {
    const ride = await this.ridesService.getRideOrThrow(rideId);
    const days: TravelDayView[] = [];
    for (const date of upcomingTravelDates(ride, new Date())) {
      if (await this.tripStarted(rideId, date)) continue;
      const taken = await this.seatsTaken(rideId, date);
      days.push({ date, seatsLeft: Math.max(0, ride.seatsAvailable - taken) });
    }
    return days;
  }

  // once that day's trip has started (or finished), the day is closed for booking
  private async tripStarted(rideId: string, date: string): Promise<boolean> {
    return (await this.tripModel.exists({ rideId, date }).exec()) !== null;
  }

  // one ride's bookings on one day, in the order the driver accepted them
  async findForDay(
    rideId: string,
    date: string,
    statuses: BookingStatus[],
  ): Promise<BookingDocument[]> {
    return this.bookingModel
      .find({ rideId, travelDate: date, status: { $in: statuses } })
      .sort({ respondedAt: 1 })
      .exec();
  }

  // a passenger's accepted bookings for one day, with their PIN
  async findAcceptedForPassenger(
    passengerId: string,
    date: string,
  ): Promise<BookingDocument[]> {
    return this.bookingModel
      .find(
        { passengerId, travelDate: date, status: BookingStatus.ACCEPTED },
        '+pickupPin',
      )
      .exec();
  }

  // the trip has left, so requests nobody answered are declined
  async declinePendingForDay(
    rideId: string,
    date: string,
  ): Promise<BookingDocument[]> {
    const pending = await this.findForDay(rideId, date, [
      BookingStatus.REQUESTED,
    ]);
    await this.bookingModel
      .updateMany(
        {
          _id: { $in: pending.map((booking) => booking.id) },
          status: BookingStatus.REQUESTED,
        },
        { $set: { status: BookingStatus.REJECTED, respondedAt: new Date() } },
      )
      .exec();
    return pending;
  }

  // the trip finished without these passengers on board
  async markNotPickedUp(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.bookingModel
      .updateMany(
        {
          _id: { $in: ids },
          status: BookingStatus.ACCEPTED,
          pickupVerifiedAt: { $exists: false },
        },
        { $set: { status: BookingStatus.NOT_PICKED_UP } },
      )
      .exec();
  }

  // seats held on one day of a ride; the ride's seatsAvailable is what's offered each day
  private async seatsTaken(
    rideId: string,
    travelDate: string | undefined,
  ): Promise<number> {
    const bookings = await this.bookingModel
      .find({
        rideId,
        // null also matches old bookings with no date, so they share one count
        travelDate: travelDate ?? null,
        status: { $in: [BookingStatus.ACCEPTED, BookingStatus.COMPLETED] },
      })
      .select('seatsRequested')
      .exec();
    return bookings.reduce((sum, booking) => sum + booking.seatsRequested, 0);
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
    await this.notifier.answered(booking, false);
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
      // backing out of an accepted booking lowers the canceller's Trust Score
      await this.trustScoreUpdater.recalculate(cancelledBy);
      // withdrawing an unanswered request doesn't email anyone, this does
      await this.notifier.cancelled(booking, cancelledBy);
    }

    booking.status = BookingStatus.CANCELLED;
    return serializeBooking(booking);
  }

  // the driver types the PIN the passenger shows them at pickup (FR13)
  async verifyPickup(id: string, pin: string): Promise<BookingView> {
    const existing = await this.bookingModel.findById(id).exec();
    const skipWindow = this.configService.get('skipPickupWindow', {
      infer: true,
    });
    if (existing && !skipWindow) {
      if (
        existing.travelDate &&
        existing.travelDate !== colomboDateString(new Date())
      ) {
        throw new ConflictException(
          'The PIN can only be checked on the day of the trip',
        );
      }
      const ride = await this.ridesService.getRideOrThrow(
        String(existing.rideId),
      );
      const windowMinutes = this.configService.get('pickupWindowMinutes', {
        infer: true,
      });
      // 409, not 400: the app shows every 400 here as "Wrong PIN"
      if (!isWithinPickupWindow(ride, new Date(), windowMinutes)) {
        throw new ConflictException(
          `The PIN can only be checked within ${windowMinutes} minutes of departure`,
        );
      }
    }

    // one conditional update, so the PIN check and the save can't be split
    const booking = await this.bookingModel
      .findOneAndUpdate(
        {
          _id: id,
          status: BookingStatus.ACCEPTED,
          pickupPin: pin,
          pickupVerifiedAt: { $exists: false },
        },
        { $set: { pickupVerifiedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .exec();
    if (booking) {
      return serializeBooking(booking);
    }

    // nothing matched: wrong PIN, or a booking that isn't waiting for pickup
    const waiting = await this.bookingModel
      .exists({
        _id: id,
        status: BookingStatus.ACCEPTED,
        pickupVerifiedAt: { $exists: false },
      })
      .exec();
    if (waiting) {
      throw new BadRequestException('Incorrect PIN');
    }
    throw new ConflictException(
      'Only accepted bookings waiting for pickup can be verified',
    );
  }

  async complete(id: string): Promise<BookingView> {
    const booking = await this.bookingModel
      .findOneAndUpdate(
        {
          _id: id,
          status: BookingStatus.ACCEPTED,
          pickupVerifiedAt: { $exists: true },
        },
        { $set: { status: BookingStatus.COMPLETED, completedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!booking) {
      throw new ConflictException(
        'Only accepted bookings with a verified pickup can be completed',
      );
    }

    const ride = await this.ridesService.getRideOrThrow(String(booking.rideId));

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

    // the PIN is only loaded for the passenger, the driver must never see it
    const projection =
      side === BookingSide.PASSENGER ? '+pickupPin' : undefined;
    const bookings = await this.bookingModel
      .find(filter, projection)
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
    const waitingForPickup =
      booking.status === BookingStatus.ACCEPTED && !booking.pickupVerifiedAt;

    return {
      ...serializeBooking(booking),
      pickupPin:
        side === BookingSide.PASSENGER && waitingForPickup
          ? booking.pickupPin
          : undefined,
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
