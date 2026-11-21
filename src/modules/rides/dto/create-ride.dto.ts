import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  Max,
  Min,
  MinDate,
  ValidateNested,
} from 'class-validator';
import { Weekday } from '../../../common/constants';
import { GeoPointDto } from '../../../common/dto/geo-point.dto';

export class CreateRideDto {
  @IsMongoId()
  vehicleId!: string;

  @ValidateNested()
  @Type(() => GeoPointDto)
  origin!: GeoPointDto;

  @ValidateNested()
  @Type(() => GeoPointDto)
  destination!: GeoPointDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => GeoPointDto)
  via?: GeoPointDto[];

  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date(), {
    message: 'departureTime must be a valid date in the future',
  })
  departureTime!: Date;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(Weekday, { each: true })
  daysOfWeek!: Weekday[];

  @IsInt()
  @Min(1)
  @Max(8)
  seatsAvailable!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  costContribution!: number;
}
