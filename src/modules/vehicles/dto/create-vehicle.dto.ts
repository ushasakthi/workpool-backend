import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PLATE_NUMBER_REGEX } from '../../../common/utils/validation-patterns';

const NEXT_MODEL_YEAR = new Date().getFullYear() + 1;

export class CreateVehicleDto {
  @ApiProperty({ example: 'Toyota' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  make!: string;

  @ApiProperty({ example: 'Aqua' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  model!: string;

  @ApiProperty({ example: 2018, minimum: 1980, maximum: NEXT_MODEL_YEAR })
  @IsInt()
  @Min(1980)
  @Max(NEXT_MODEL_YEAR)
  year!: number;

  @ApiProperty({
    example: 'CAB-1234',
    description:
      'Sri Lankan plate — current letter series (optionally with a province code, "WP CAB-1234") or the older numeric series ("251-1234").',
  })
  @Matches(PLATE_NUMBER_REGEX, {
    message: 'plateNumber must be a valid Sri Lankan vehicle plate number',
  })
  plateNumber!: string;

  @ApiProperty({ example: 3, minimum: 1, maximum: 8 })
  @IsInt()
  @Min(1)
  @Max(8)
  seatsAvailable!: number;
}
