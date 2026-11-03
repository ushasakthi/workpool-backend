import { ApiPropertyOptional } from '@nestjs/swagger';
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
  @ApiPropertyOptional({ type: GeoPointDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoPointDto)
  homeLocation?: GeoPointDto;

  @ApiPropertyOptional({ type: GeoPointDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GeoPointDto)
  workLocation?: GeoPointDto;

  @ApiPropertyOptional({ example: '08:30' })
  @IsOptional()
  @Matches(TIME_HHMM_REGEX, {
    message: 'workStartTime must be a 24-hour HH:mm time',
  })
  workStartTime?: string;

  @ApiPropertyOptional({ example: '17:30' })
  @IsOptional()
  @Matches(TIME_HHMM_REGEX, {
    message: 'workEndTime must be a 24-hour HH:mm time',
  })
  workEndTime?: string;

  @ApiPropertyOptional({
    enum: Weekday,
    isArray: true,
    example: [Weekday.MON, Weekday.TUE, Weekday.WED],
  })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsEnum(Weekday, { each: true })
  daysAvailable?: Weekday[];

  @ApiPropertyOptional({ enum: PreferredRole })
  @IsOptional()
  @IsEnum(PreferredRole)
  preferredRole?: PreferredRole;

  @ApiPropertyOptional({
    example: false,
    description:
      "Hide the exact workplace name from other users' view of this profile",
  })
  @IsOptional()
  @IsBoolean()
  hideWorkplaceName?: boolean;
}
