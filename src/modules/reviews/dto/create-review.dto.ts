import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateReviewDto {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  @IsMongoId()
  bookingId!: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @ApiPropertyOptional({ example: 'On time and a smooth drive.' })
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'comment cannot be blank' })
  @MaxLength(500)
  comment?: string;
}
