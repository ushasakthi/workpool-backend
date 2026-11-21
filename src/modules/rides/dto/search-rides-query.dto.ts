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
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.5)
  @Max(50)
  maxDistanceKm: number = PICKUP_CUTOFF_KM;

  @IsOptional()
  @Matches(TIME_HHMM_REGEX, { message: 'departAfter must be HH:mm' })
  departAfter?: string;

  @IsOptional()
  @Matches(TIME_HHMM_REGEX, { message: 'departBefore must be HH:mm' })
  departBefore?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit: number = 10;
}
