import { IsIn, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { VerificationStatus } from '../../../common/constants';

const REVIEW_STATUSES = [
  VerificationStatus.VERIFIED,
  VerificationStatus.REJECTED,
];

export class ReviewVerificationDto {
  @IsIn(REVIEW_STATUSES)
  status: VerificationStatus;

  @ValidateIf(
    (dto: ReviewVerificationDto) => dto.status === VerificationStatus.REJECTED,
  )
  @IsString()
  @IsNotEmpty()
  rejectionReason?: string;
}
