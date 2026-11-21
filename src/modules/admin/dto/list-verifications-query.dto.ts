import { IsEnum, IsOptional } from 'class-validator';
import { VerificationStatus } from '../../../common/constants';

export class ListVerificationsQueryDto {
  @IsOptional()
  @IsEnum(VerificationStatus)
  status?: VerificationStatus;
}
