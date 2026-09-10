import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDate,
  IsEnum,
  IsInt,
  IsMongoId,
  IsNumber,
  Max,
  Min,
  MinDate,
  ValidateNested,
} from 'class-validator';
import { Weekday } from '../../../common/constants';
import { GeoPointDto } from '../../../common/dto/geo-point.dto';

export class CreateRideDto {
  @ApiProperty({
    example: '665f1b2c3d4e5f6a7b8c9d0e',
    description: "Id of one of the caller's own vehicles",
  })
  @IsMongoId()
  vehicleId!: string;

  @ApiProperty({ type: GeoPointDto })
  @ValidateNested()
  @Type(() => GeoPointDto)
  origin!: GeoPointDto;

  @ApiProperty({ type: GeoPointDto })
  @ValidateNested()
  @Type(() => GeoPointDto)
  destination!: GeoPointDto;

  @ApiProperty({
    example: '2026-09-15T07:30:00.000Z',
    description: 'Departure instant (ISO 8601) — must be in the future',
  })
  @Type(() => Date)
  @IsDate()
  @MinDate(() => new Date(), {
    message: 'departureTime must be a valid date in the future',
  })
  departureTime!: Date;

  @ApiProperty({
    enum: Weekday,
    isArray: true,
    example: [Weekday.MON, Weekday.WED, Weekday.FRI],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(Weekday, { each: true })
  daysOfWeek!: Weekday[];

  @ApiProperty({ example: 3, minimum: 1, maximum: 8 })
  @IsInt()
  @Min(1)
  @Max(8)
  seatsAvailable!: number;

  @ApiProperty({
    example: 400,
    minimum: 0,
    description:
      'Suggested contribution toward shared fuel / running costs (LKR). A cost-sharing amount — never a fare, price, or commission.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100000)
  costContribution!: number;
}
