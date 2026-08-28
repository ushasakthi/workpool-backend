import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { VerificationStatus } from '../../../common/constants';

export class ListVerificationsQueryDto {
  @ApiPropertyOptional({
    enum: VerificationStatus,
    description: 'Omit to list submissions in every status',
  })
  @IsOptional()
  @IsEnum(VerificationStatus)
  status?: VerificationStatus;
}
