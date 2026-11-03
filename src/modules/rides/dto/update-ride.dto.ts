import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { RideStatus } from '../../../common/constants';
import { CreateRideDto } from './create-ride.dto';

// used for edit, pause and cancel (through status)
export class UpdateRideDto extends PartialType(CreateRideDto) {
  @ApiPropertyOptional({
    enum: RideStatus,
    description: 'Set to "paused" or "cancelled" to pause or cancel the ride',
  })
  @IsOptional()
  @IsEnum(RideStatus)
  status?: RideStatus;
}
