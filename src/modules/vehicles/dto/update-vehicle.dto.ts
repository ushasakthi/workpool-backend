import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CreateVehicleDto } from './create-vehicle.dto';

// Partial update — every create field is optional here, same validation rules.
// The photo is updated through PATCH /vehicles/:id/photo, not this body.
export class UpdateVehicleDto extends PartialType(CreateVehicleDto) {
  @ApiPropertyOptional({
    description:
      'Set false to retire the vehicle without deleting it (hidden from ride posting).',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
