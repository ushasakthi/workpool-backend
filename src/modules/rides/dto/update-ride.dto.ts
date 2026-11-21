import { PartialType } from '@nestjs/mapped-types';
import { IsEnum, IsOptional } from 'class-validator';
import { RideStatus } from '../../../common/constants';
import { CreateRideDto } from './create-ride.dto';

// used for edit, pause and cancel (through status)
export class UpdateRideDto extends PartialType(CreateRideDto) {
  @IsOptional()
  @IsEnum(RideStatus)
  status?: RideStatus;
}
