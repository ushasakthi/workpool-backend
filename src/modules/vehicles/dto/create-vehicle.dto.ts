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
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  make!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  model!: string;

  @IsInt()
  @Min(1980)
  @Max(NEXT_MODEL_YEAR)
  year!: number;

  @Matches(PLATE_NUMBER_REGEX, {
    message: 'plateNumber must be a valid Sri Lankan vehicle plate number',
  })
  plateNumber!: string;

  @IsInt()
  @Min(1)
  @Max(8)
  seatsAvailable!: number;
}
