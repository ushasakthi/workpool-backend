import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { RideStatus, Weekday } from '../../common/constants';
import { buildUpdateSet } from '../../common/utils/build-update-set';
import { VehiclesService } from '../vehicles/vehicles.service';
import { Ride, RideDocument } from './schemas/ride.schema';
import { serializeRide, RideView } from './serializers/ride.serializer';

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

@Injectable()
export class RidesService {
  constructor(
    @InjectModel(Ride.name) private readonly rideModel: Model<RideDocument>,
    private readonly vehiclesService: VehiclesService,
  ) {}

  async create(driverId: string, input: CreateRideInput): Promise<RideView> {
    await this.assertVehicleFitsRide(
      input.vehicleId,
      driverId,
      input.seatsAvailable,
    );

    const ride = await new this.rideModel({
      ...input,
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

    const set = buildUpdateSet(input);
    const update = Object.keys(set).length > 0 ? { $set: set } : {};
    const ride = await this.rideModel
      .findByIdAndUpdate(id, update, { returnDocument: 'after' })
      .exec();

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    return serializeRide(ride);
  }

  private async getRideOrThrow(id: string): Promise<RideDocument> {
    const ride = await this.rideModel.findById(id).exec();
    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    return ride;
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
