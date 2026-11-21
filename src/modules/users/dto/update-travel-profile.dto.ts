import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  Matches,
  ValidateNested,
} from 'class-validator';
import { PreferredRole, Weekday } from '../../../common/constants';
import { TIME_HHMM_REGEX } from '../../../common/utils/validation-patterns';
import { GeoPointDto } from './geo-point.dto';

export class UpdateTravelProfileDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoPointDto)
  homeLocation?: GeoPointDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => GeoPointDto)
  workLocation?: GeoPointDto;

  @IsOptional()
  @Matches(TIME_HHMM_REGEX, {
    message: 'workStartTime must be a 24-hour HH:mm time',
  })
  workStartTime?: string;

  @IsOptional()
  @Matches(TIME_HHMM_REGEX, {
    message: 'workEndTime must be a 24-hour HH:mm time',
  })
  workEndTime?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Weekday, { each: true })
  daysAvailable?: Weekday[];

  @IsOptional()
  @IsEnum(PreferredRole)
  preferredRole?: PreferredRole;

  @IsOptional()
  @IsBoolean()
  hideWorkplaceName?: boolean;
}
