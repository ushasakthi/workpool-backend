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
  @IsMongoId()
  bookingId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @Matches(/\S/, { message: 'comment cannot be blank' })
  @MaxLength(500)
  comment?: string;
}
