import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { TIME_HHMM_REGEX } from '../../../common/utils/validation-patterns';
import { PICKUP_CUTOFF_KM } from '../matching/smart-matching.service';

export class SearchRidesQueryDto {
  @ApiPropertyOptional({
    example: 3,
    default: 3,
    description: "Max distance (km) from your home to the driver's route",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(50)
  maxDistanceKm: number = PICKUP_CUTOFF_KM;

  @ApiPropertyOptional({
    example: '06:30',
    description: 'Earliest departure, Colombo time (HH:mm)',
  })
  @IsOptional()
  @Matches(TIME_HHMM_REGEX, { message: 'departAfter must be HH:mm' })
  departAfter?: string;

  @ApiPropertyOptional({
    example: '08:30',
    description: 'Latest departure, Colombo time (HH:mm)',
  })
  @IsOptional()
  @Matches(TIME_HHMM_REGEX, { message: 'departBefore must be HH:mm' })
  departBefore?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ example: 10, default: 10, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;
}
