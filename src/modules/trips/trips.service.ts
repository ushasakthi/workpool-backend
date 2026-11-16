import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { BookingStatus, RideStatus, TripStatus } from '../../common/constants';
import { AppConfig } from '../../config/configuration';
import { BookingsService } from '../bookings/bookings.service';
import { driverSharing } from '../bookings/savings/savings';
import { BookingDocument } from '../bookings/schemas/booking.schema';
import { colomboDateString, isValidTravelDate } from '../bookings/travel-date';
import {
  colomboMinutesOfDay,
  haversine,
} from '../rides/matching/smart-matching.service';
import { RidesService } from '../rides/rides.service';
import { RideDocument } from '../rides/schemas/ride.schema';
import { UsersService } from '../users/users.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { TripNotifier } from './notifications/trip-notifier';
import { Trip, TripDocument } from './schemas/trip.schema';
import {
  DriverTripView,
  PassengerTripView,
  TodayRideView,
  TripStopView,
  TripSummaryView,
  TripView,
} from './serializers/trip.serializer';

const START_EARLY_MINUTES = 30;
const DUPLICATE_KEY_ERROR_CODE = 11000;

// 450 → "07:30"
export function formatMinutes(minutes: number): string {
  const hours = String(Math.floor(minutes / 60)).padStart(2, '0');
  return `${hours}:${String(minutes % 60).padStart(2, '0')}`;
}

// the driver can start from 30 min before departure (Colombo time) on that day
export function tripCanStartAt(departureTime: Date, date: string): Date {
  const minutes = Math.max(
    0,
    colomboMinutesOfDay(new Date(departureTime)) - START_EARLY_MINUTES,
  );
  return new Date(`${date}T${formatMinutes(minutes)}:00+05:30`);
}

@Injectable()
export class TripsService {
  constructor(
    @InjectModel(Trip.name)
    private readonly tripModel: Model<TripDocument>,
    private readonly bookingsService: BookingsService,
    private readonly ridesService: RidesService,
    private readonly usersService: UsersService,
    private readonly vehiclesService: VehiclesService,
    private readonly notifier: TripNotifier,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  // Home: the driver's rides that run today, with what "Start trip" needs
  async todayForDriver(driverId: string): Promise<TodayRideView[]> {
    const now = new Date();
    const today = colomboDateString(now);
    const rides = await this.ridesService.findMine(driverId);
    const todays = rides.filter(
      (ride) =>
        ride.status === RideStatus.ACTIVE &&
        isValidTravelDate(ride, today, now),
    );

    const views: TodayRideView[] = [];
    for (const ride of todays) {
      const riders = await this.bookingsService.findForDay(ride.id, today, [
        BookingStatus.ACCEPTED,
        BookingStatus.COMPLETED,
      ]);
      const trip = await this.tripModel
        .findOne({ rideId: ride.id, date: today })
        .exec();
      views.push({
        rideId: ride.id,
        origin: ride.origin,
        destination: ride.destination,
        departureTime: ride.departureTime,
        riders: riders.length,
        // testing mode: open from midnight, so the app's clock is never "too early"
        canStartAt: this.skipTimeChecks()
          ? new Date(`${today}T00:00:00+05:30`)
          : tripCanStartAt(ride.departureTime, today),
        tripId: trip ? trip.id : null,
        tripStatus: trip ? trip.status : null,
      });
    }
    // earliest departure first
    return views.sort(
      (a, b) =>
        colomboMinutesOfDay(new Date(a.departureTime)) -
        colomboMinutesOfDay(new Date(b.departureTime)),
    );
  }

  async start(driverId: string, rideId: string): Promise<DriverTripView> {
    const ride = await this.ridesService.getRideOrThrow(rideId);
    if (String(ride.driverId) !== driverId) {
      throw new ForbiddenException('Only the driver can start this trip');
    }
    if (ride.status !== RideStatus.ACTIVE) {
      throw new BadRequestException('This ride is paused or cancelled');
    }

    const now = new Date();
    const today = colomboDateString(now);
    if (!isValidTravelDate(ride, today, now)) {
      throw new BadRequestException("This ride doesn't run today");
    }
    const canStartAt = tripCanStartAt(ride.departureTime, today);
    if (!this.skipTimeChecks() && now < canStartAt) {
      throw new ConflictException(
        `You can start from ${formatMinutes(colomboMinutesOfDay(canStartAt))}`,
      );
    }

    const riders = await this.bookingsService.findForDay(rideId, today, [
      BookingStatus.ACCEPTED,
    ]);
    if (riders.length === 0) {
      throw new ConflictException('No riders booked for today');
    }
    const driving = await this.tripModel
      .exists({ driverId, status: TripStatus.IN_PROGRESS })
      .exec();
    if (driving) {
      throw new ConflictException('Finish your current trip first');
    }

    let trip: TripDocument;
    try {
      trip = await this.tripModel.create({
        rideId,
        driverId,
        date: today,
        status: TripStatus.IN_PROGRESS,
        startedAt: now,
      });
    } catch (err) {
      // the unique indexes caught a double tap, or today's trip already ran
      if ((err as { code?: number }).code === DUPLICATE_KEY_ERROR_CODE) {
        throw new ConflictException(
          "Today's trip has already started or finished",
        );
      }
      throw err;
    }

    const declined = await this.bookingsService.declinePendingForDay(
      rideId,
      today,
    );
    const driver = await this.usersService.getPublicProfile(driverId, driverId);
    await this.notifier.started(
      driver.name,
      pickupLabel(ride),
      formatMinutes(colomboMinutesOfDay(new Date(ride.departureTime))),
      riders,
    );
    await this.notifier.rideLeft(driver.name, declined);

    return this.toDriverView(trip, ride, driverId);
  }

  // the trip I'm on right now, as the driver or as a passenger; null if none
  async current(userId: string): Promise<TripView | null> {
    const driving = await this.tripModel
      .findOne({ driverId: userId, status: TripStatus.IN_PROGRESS })
      .exec();
    if (driving) {
      const ride = await this.ridesService.getRideOrThrow(
        String(driving.rideId),
      );
      return this.toDriverView(driving, ride, userId);
    }

    const today = colomboDateString(new Date());
    const myBookings = await this.bookingsService.findAcceptedForPassenger(
      userId,
      today,
    );
    for (const booking of myBookings) {
      const trip = await this.tripModel
        .findOne({
          rideId: booking.rideId,
          date: today,
          status: TripStatus.IN_PROGRESS,
        })
        .exec();
      if (trip) {
        return this.toPassengerView(trip, booking, userId);
      }
    }
    return null;
  }

  async finish(driverId: string, tripId: string): Promise<TripSummaryView> {
    if (!isValidObjectId(tripId)) {
      throw new NotFoundException('Trip not found');
    }
    // claim it first, so a double tap can't finish it twice
    const trip = await this.tripModel
      .findOneAndUpdate(
        { _id: tripId, driverId, status: TripStatus.IN_PROGRESS },
        { $set: { status: TripStatus.FINISHED, finishedAt: new Date() } },
        { returnDocument: 'after' },
      )
      .exec();
    if (!trip) {
      throw new ConflictException('This trip is not in progress');
    }

    const rideId = String(trip.rideId);
    // COMPLETED = already dropped off on the way
    const onTrip = await this.bookingsService.findForDay(rideId, trip.date, [
      BookingStatus.ACCEPTED,
      BookingStatus.COMPLETED,
    ]);
    const pickedUp = onTrip.filter((booking) => booking.pickupVerifiedAt);
    const stillOnBoard = pickedUp.filter(
      (booking) => booking.status === BookingStatus.ACCEPTED,
    );
    const missed = onTrip.filter((booking) => !booking.pickupVerifiedAt);

    for (const booking of stillOnBoard) {
      await this.bookingsService.complete(booking.id);
    }
    await this.bookingsService.markNotPickedUp(
      missed.map((booking) => booking.id),
    );

    const ride = await this.ridesService.getRideOrThrow(rideId);
    const driver = await this.usersService.getPublicProfile(driverId, driverId);
    await this.notifier.finished(driver.name, stillOnBoard);

    const distanceKm = haversine(ride.origin, ride.destination);
    const shared = driverSharing(
      pickedUp.map((booking) => ({
        distanceKm,
        contribution: ride.costContribution * booking.seatsRequested,
      })),
    );
    return {
      id: trip.id,
      origin: ride.origin,
      destination: ride.destination,
      startedAt: trip.startedAt,
      finishedAt: trip.finishedAt ?? new Date(),
      riders: pickedUp.length,
      costsShared: shared.costsShared,
      co2SavedKg: shared.co2SavedKg,
      completedBookingIds: pickedUp.map((booking) => booking.id),
    };
  }

  private async toDriverView(
    trip: TripDocument,
    ride: RideDocument,
    driverId: string,
  ): Promise<DriverTripView> {
    const bookings = await this.bookingsService.findForDay(
      String(trip.rideId),
      trip.date,
      [BookingStatus.ACCEPTED, BookingStatus.COMPLETED],
    );
    const stops: TripStopView[] = [];
    for (const booking of bookings) {
      const passenger = await this.usersService.getPublicProfile(
        String(booking.passengerId),
        driverId,
      );
      stops.push({
        bookingId: booking.id,
        passenger: {
          id: passenger.id,
          name: passenger.name,
          trustScore: passenger.trustScore.score,
        },
        seats: booking.seatsRequested,
        pickupLabel: pickupLabel(ride),
        pickedUpAt: booking.pickupVerifiedAt,
        droppedOffAt: booking.completedAt,
      });
    }
    return { ...tripBase(trip, ride), side: 'driver', stops };
  }

  private async toPassengerView(
    trip: TripDocument,
    booking: BookingDocument,
    passengerId: string,
  ): Promise<PassengerTripView> {
    const ride = await this.ridesService.getRideOrThrow(String(trip.rideId));
    const driver = await this.usersService.getPublicProfile(
      String(ride.driverId),
      passengerId,
    );
    const onTrip = await this.bookingsService.findForDay(
      String(trip.rideId),
      trip.date,
      [BookingStatus.ACCEPTED, BookingStatus.COMPLETED],
    );
    const stopIndex = onTrip.findIndex((other) => other.id === booking.id);

    return {
      ...tripBase(trip, ride),
      side: 'passenger',
      driver: {
        id: driver.id,
        name: driver.name,
        trustScore: driver.trustScore.score,
      },
      vehicle: await this.findVehicle(ride),
      booking: {
        id: booking.id,
        seats: booking.seatsRequested,
        costContribution: ride.costContribution,
        pickupPin: booking.pickupVerifiedAt ? undefined : booking.pickupPin,
        pickedUpAt: booking.pickupVerifiedAt,
      },
      pickupLabel: pickupLabel(ride),
      stopNumber: stopIndex + 1,
      stopCount: onTrip.length,
    };
  }

  // the car is only a nice-to-have on the passenger's screen
  private async findVehicle(
    ride: RideDocument,
  ): Promise<PassengerTripView['vehicle']> {
    try {
      const vehicle = await this.vehiclesService.findOwnedVehicleOrThrow(
        String(ride.vehicleId),
        String(ride.driverId),
      );
      return {
        make: vehicle.make,
        model: vehicle.model,
        plateNumber: vehicle.plateNumber,
      };
    } catch {
      return null;
    }
  }

  // same dev-only switch as the pickup PIN window
  private skipTimeChecks(): boolean {
    return this.configService.get('skipPickupWindow', { infer: true });
  }
}

function pickupLabel(ride: RideDocument): string {
  return ride.origin.label ?? 'the start point';
}

function tripBase(trip: TripDocument, ride: RideDocument) {
  return {
    id: trip.id,
    rideId: String(trip.rideId),
    date: trip.date,
    startedAt: trip.startedAt,
    origin: ride.origin,
    destination: ride.destination,
    departureTime: ride.departureTime,
  };
}
