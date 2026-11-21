import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
    // .create() clashes with the `model` field, so use new + save
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

  // checks the vehicle exists and belongs to the driver
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
    if (!vehicle.isActive) {
      throw new BadRequestException('This vehicle is inactive');
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
