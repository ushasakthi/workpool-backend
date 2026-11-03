import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ReportCategory } from '../../../common/constants';

export class CreateReportDto {
  @ApiProperty({ example: '665f1b2c3d4e5f6a7b8c9d0e' })
  @IsMongoId()
  bookingId!: string;

  @ApiProperty({ enum: ReportCategory, example: ReportCategory.NO_SHOW })
  @IsEnum(ReportCategory)
  category!: ReportCategory;

  // optional, the category already says what happened
  @ApiPropertyOptional({
    example: 'Waited 20 minutes at the pickup, no reply.',
  })
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'reason cannot be blank' })
  @MaxLength(500)
  reason?: string;
}
