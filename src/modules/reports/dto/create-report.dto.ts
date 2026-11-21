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
  @IsMongoId()
  bookingId!: string;

  @IsEnum(ReportCategory)
  category!: ReportCategory;

  // optional, the category already says what happened
  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'reason cannot be blank' })
  @MaxLength(500)
  reason?: string;
}
