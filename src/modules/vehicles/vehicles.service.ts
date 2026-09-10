import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { resolve } from 'path';
import { AppConfig } from '../../config/configuration';
import { buildUpdateSet } from '../../common/utils/build-update-set';
import { Vehicle, VehicleDocument } from './schemas/vehicle.schema';
import {
  serializeVehicle,
  VehicleView,
} from './serializers/vehicle.serializer';

export interface CreateVehicleInput {
  make: string;
  model: string;
  year: number;
  plateNumber: string;
  seatsAvailable: number;
}

export type UpdateVehicleInput = Partial<CreateVehicleInput> & {
  isActive?: boolean;
};

@Injectable()
export class VehiclesService {
  constructor(
    @InjectModel(Vehicle.name)
    private readonly vehicleModel: Model<VehicleDocument>,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  async create(
    ownerId: string,
    input: CreateVehicleInput,
  ): Promise<VehicleView> {
    // `new … .save()` rather than `.create()` — a schema field named `model`
    // collides with Mongoose's Document.model() in the `.create()` overload.
    const vehicle = await new this.vehicleModel({ ...input, ownerId }).save();
    return serializeVehicle(vehicle);
  }

  async findMine(ownerId: string): Promise<VehicleView[]> {
    const vehicles = await this.vehicleModel
      .find({ ownerId })
      .sort({ createdAt: -1 })
      .exec();
    return vehicles.map(serializeVehicle);
  }

  update(id: string, input: UpdateVehicleInput): Promise<VehicleView> {
    return this.applyUpdate(id, buildUpdateSet(input));
  }

  updatePhoto(id: string, photoFilename: string): Promise<VehicleView> {
    return this.applyUpdate(id, { photoUrl: photoFilename });
  }

  async resolveVehiclePhotoPath(id: string): Promise<string> {
    if (!isValidObjectId(id)) {
      throw new NotFoundException('No photo found for this vehicle');
    }

    const vehicle = await this.vehicleModel.findById(id).exec();
    if (!vehicle?.photoUrl) {
      throw new NotFoundException('No photo found for this vehicle');
    }

    const { vehiclePhotoDir } = this.configService.get('uploads', {
      infer: true,
    });
    return resolve(vehiclePhotoDir, vehicle.photoUrl);
  }

  // Used by RidesService when a driver posts or edits a ride: the vehicle must
  // exist and belong to that driver. Returns the doc so the caller can check
  // the ride's seat count against the vehicle's capacity.
  // TODO(sprint4): also reject `!vehicle.isActive` here once ride posting lands.
  async findOwnedVehicleOrThrow(
    vehicleId: string,
    ownerId: string,
  ): Promise<VehicleDocument> {
    const vehicle = isValidObjectId(vehicleId)
      ? await this.vehicleModel.findById(vehicleId).exec()
      : null;

    if (!vehicle || String(vehicle.ownerId) !== ownerId) {
      throw new NotFoundException('Vehicle not found');
    }
    return vehicle;
  }

  private async applyUpdate(
    id: string,
    set: Record<string, unknown>,
  ): Promise<VehicleView> {
    const update = Object.keys(set).length > 0 ? { $set: set } : {};
    const vehicle = await this.vehicleModel
      .findByIdAndUpdate(id, update, { returnDocument: 'after' })
      .exec();

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    return serializeVehicle(vehicle);
  }
}
