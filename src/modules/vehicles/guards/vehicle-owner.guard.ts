import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model } from 'mongoose';
import { AuthenticatedUser } from '../../../common/decorators/current-user.decorator';
import { isOwnerOrAdmin } from '../../../common/utils/ownership.util';
import { Vehicle, VehicleDocument } from '../schemas/vehicle.schema';

// only the vehicle owner or an admin can change it
@Injectable()
export class VehicleOwnerGuard implements CanActivate {
  constructor(
    @InjectModel(Vehicle.name)
    private readonly vehicleModel: Model<VehicleDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      params: { id?: string };
      user?: AuthenticatedUser;
    }>();
    const { user, params } = request;

    if (!user) {
      return false;
    }
    if (!params.id || !isValidObjectId(params.id)) {
      throw new NotFoundException('Vehicle not found');
    }

    const vehicle = await this.vehicleModel
      .findById(params.id)
      .select('ownerId')
      .lean()
      .exec();

    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    if (!isOwnerOrAdmin(vehicle.ownerId, user)) {
      throw new ForbiddenException(
        'Only the vehicle owner can modify this vehicle',
      );
    }
    return true;
  }
}
