import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { RideStatus, Weekday } from '../../common/constants';
import { toGeoJsonPoint } from '../../common/schemas/geo-json-point.schema';
import { buildUpdateSet } from '../../common/utils/build-update-set';
import { UsersService } from '../users/users.service';
import { VehiclesService } from '../vehicles/vehicles.service';
import { GeoPoint } from '../../common/schemas/geo-point.schema';
import {
  colomboMinutesOfDay,
  haversine,
  hhmmToMinutes,
  SmartMatchingService,
  SmsResult,
} from './matching/smart-matching.service';
import { Ride, RideDocument } from './schemas/ride.schema';
import {
  serializeRide,
  RideDetailView,
  RideSearchPage,
  RideView,
  RideWithMatchView,
} from './serializers/ride.serializer';

const EARTH_RADIUS_KM = 6371;

export interface GeoPointInput {
  lat: number;
  lng: number;
  label?: string;
}

export interface CreateRideInput {
  vehicleId: string;
  origin: GeoPointInput;
  destination: GeoPointInput;
  departureTime: Date;
  daysOfWeek: Weekday[];
  seatsAvailable: number;
  costContribution: number;
}

export type UpdateRideInput = Partial<CreateRideInput> & {
  status?: RideStatus;
};

export interface SearchRidesInput {
  maxDistanceKm: number;
  departAfter?: string;
  departBefore?: string;
  page: number;
  limit: number;
}

@Injectable()
export class RidesService {
  constructor(
    @InjectModel(Ride.name) private readonly rideModel: Model<RideDocument>,
    private readonly vehiclesService: VehiclesService,
    private readonly usersService: UsersService,
    private readonly smartMatchingService: SmartMatchingService,
  ) {}

  async create(driverId: string, input: CreateRideInput): Promise<RideView> {
    await this.assertVehicleFitsRide(
      input.vehicleId,
      driverId,
      input.seatsAvailable,
    );

    const ride = await new this.rideModel({
      ...input,
      originPoint: toGeoJsonPoint(input.origin),
      destinationPoint: toGeoJsonPoint(input.destination),
      driverId,
      status: RideStatus.ACTIVE,
    }).save();
    return serializeRide(ride);
  }

  async findMine(driverId: string): Promise<RideView[]> {
    const rides = await this.rideModel
      .find({ driverId })
      .sort({ createdAt: -1 })
      .exec();
    return rides.map(serializeRide);
  }

  // Mongo narrows rides down by pickup distance (geo index), then we score,
  // sort and page in memory, since the score can't be computed inside Mongo
  async search(
    passengerId: string,
    input: SearchRidesInput,
  ): Promise<RideSearchPage> {
    const { travelProfile } = await this.usersService.findMe(passengerId);
    const home = travelProfile?.homeLocation;
    if (!home) {
      throw new BadRequestException(
        'Set your home location in your travel profile to search rides',
      );
    }

    const rides = await this.rideModel
      .find({
        status: RideStatus.ACTIVE,
        driverId: { $ne: passengerId },
        seatsAvailable: { $gt: 0 },
        originPoint: {
          $geoWithin: {
            $centerSphere: [
              [home.lng, home.lat],
              input.maxDistanceKm / EARTH_RADIUS_KM,
            ],
          },
        },
      })
      .exec();

    const scored = rides
      .filter((ride) =>
        isInTimeWindow(
          ride.departureTime,
          input.departAfter,
          input.departBefore,
        ),
      )
      .map((ride) => ({
        ride,
        match: this.smartMatchingService.calculateScore(travelProfile, ride),
      }))
      .sort((a, b) => b.match.score - a.match.score);

    // drivers are only looked up for the rides on this page
    const start = (input.page - 1) * input.limit;
    const pageItems = scored.slice(start, start + input.limit);
    const items = await Promise.all(
      pageItems.map(({ ride, match }) =>
        this.toMatchView(ride, match, home, passengerId),
      ),
    );

    return {
      items,
      page: input.page,
      limit: input.limit,
      total: scored.length,
    };
  }

  async findOne(id: string, requesterId: string): Promise<RideDetailView> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException('Ride not found');
    }
    const ride = await this.getRideOrThrow(id);

    const { travelProfile } = await this.usersService.findMe(requesterId);
    const match = this.smartMatchingService.calculateScore(travelProfile, ride);

    return this.toMatchView(
      ride,
      match,
      travelProfile?.homeLocation,
      requesterId,
    );
  }

  async update(
    id: string,
    driverId: string,
    input: UpdateRideInput,
  ): Promise<RideView> {
    // Re-validate the vehicle whenever the ride's vehicle or seat count changes.
    if (input.vehicleId !== undefined || input.seatsAvailable !== undefined) {
      const current = await this.getRideOrThrow(id);
      await this.assertVehicleFitsRide(
        input.vehicleId ?? String(current.vehicleId),
        driverId,
        input.seatsAvailable ?? current.seatsAvailable,
      );
    }

    // keep the GeoJSON copies in sync when the route changes
    const set = buildUpdateSet({
      ...input,
      originPoint: input.origin ? toGeoJsonPoint(input.origin) : undefined,
      destinationPoint: input.destination
        ? toGeoJsonPoint(input.destination)
        : undefined,
    });
    const update = Object.keys(set).length > 0 ? { $set: set } : {};
    const ride = await this.rideModel
      .findByIdAndUpdate(id, update, { returnDocument: 'after' })
      .exec();

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    return serializeRide(ride);
  }

  private async toMatchView(
    ride: RideDocument,
    match: SmsResult,
    home: GeoPoint | undefined,
    requesterId: string,
  ): Promise<RideWithMatchView> {
    const driver = await this.usersService.getPublicProfile(
      String(ride.driverId),
      requesterId,
    );

    return {
      ...serializeRide(ride),
      match,
      pickupDistanceKm: home ? haversine(home, ride.origin) : null,
      driver: {
        id: driver.id,
        name: driver.name,
        photoUrl: driver.photoUrl,
        verification: {
          identityStatus: driver.verification.identityStatus,
          workplaceStatus: driver.verification.workplaceStatus,
        },
        trustScore: driver.trustScore.score,
      },
    };
  }

  async getRideOrThrow(id: string): Promise<RideDocument> {
    const ride = await this.rideModel.findById(id).exec();
    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    return ride;
  }

  async findRideIdsByDriver(driverId: string): Promise<string[]> {
    const rides = await this.rideModel.find({ driverId }).select('_id').exec();
    return rides.map((ride) => ride.id);
  }

  // One atomic update: only takes the seats if enough are still free, so two
  // accepts at the same moment can't both succeed and overbook the ride.
  async reserveSeats(rideId: string, seats: number): Promise<boolean> {
    const ride = await this.rideModel
      .findOneAndUpdate(
        {
          _id: rideId,
          status: RideStatus.ACTIVE,
          seatsAvailable: { $gte: seats },
        },
        { $inc: { seatsAvailable: -seats } },
      )
      .exec();
    return ride !== null;
  }

  async releaseSeats(rideId: string, seats: number): Promise<void> {
    await this.rideModel
      .updateOne({ _id: rideId }, { $inc: { seatsAvailable: seats } })
      .exec();
  }

  // The vehicle must exist and belong to the driver, and can't seat fewer
  // passengers than the ride offers.
  private async assertVehicleFitsRide(
    vehicleId: string,
    driverId: string,
    rideSeats: number,
  ): Promise<void> {
    const vehicle = await this.vehiclesService.findOwnedVehicleOrThrow(
      vehicleId,
      driverId,
    );
    if (rideSeats > vehicle.seatsAvailable) {
      throw new BadRequestException(
        `seatsAvailable cannot exceed the vehicle's ${vehicle.seatsAvailable} seats`,
      );
    }
  }
}

// both ends optional, compared as Colombo time of day
function isInTimeWindow(
  departureTime: Date,
  after?: string,
  before?: string,
): boolean {
  const minutes = colomboMinutesOfDay(new Date(departureTime));
  if (after && minutes < hhmmToMinutes(after)) return false;
  if (before && minutes > hhmmToMinutes(before)) return false;
  return true;
}
