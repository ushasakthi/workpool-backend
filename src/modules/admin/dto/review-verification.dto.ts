import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { VerificationStatus } from '../../../common/constants';

const REVIEW_STATUSES = [
  VerificationStatus.VERIFIED,
  VerificationStatus.REJECTED,
];

export class ReviewVerificationDto {
  @ApiProperty({ enum: REVIEW_STATUSES })
  @IsIn(REVIEW_STATUSES)
  status: VerificationStatus;

  @ApiPropertyOptional({
    description: 'Required when status is "rejected"',
  })
  @ValidateIf(
    (dto: ReviewVerificationDto) => dto.status === VerificationStatus.REJECTED,
  )
  @IsString()
  @IsNotEmpty()
  rejectionReason?: string;
}
