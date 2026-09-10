import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { RideStatus } from '../../../common/constants';
import { CreateRideDto } from './create-ride.dto';

// One PATCH covers edit, pause, and cancel. Every create field is optional
// here; `status` is added for pause ("paused") / cancel ("cancelled").
export class UpdateRideDto extends PartialType(CreateRideDto) {
  @ApiPropertyOptional({
    enum: RideStatus,
    description: 'Set to "paused" or "cancelled" to pause or cancel the ride',
  })
  @IsOptional()
  @IsEnum(RideStatus)
  status?: RideStatus;
}
