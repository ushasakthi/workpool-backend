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
import { Ride, RideDocument } from '../schemas/ride.schema';

// only the ride's driver or an admin can change it
@Injectable()
export class RideOwnerGuard implements CanActivate {
  constructor(
    @InjectModel(Ride.name) private readonly rideModel: Model<RideDocument>,
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
      throw new NotFoundException('Ride not found');
    }

    const ride = await this.rideModel
      .findById(params.id)
      .select('driverId')
      .lean()
      .exec();

    if (!ride) {
      throw new NotFoundException('Ride not found');
    }
    if (!isOwnerOrAdmin(ride.driverId, user)) {
      throw new ForbiddenException('Only the ride owner can modify this ride');
    }
    return true;
  }
}
