import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// Request-body shape for a { lat, lng, label } map point. Shared by the
// travel-profile and ride DTOs.
export class GeoPointDto {
  @ApiProperty({ example: 6.9271 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty({ example: 79.8612 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng!: number;

  @ApiPropertyOptional({ example: 'Colombo 03' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;
}
