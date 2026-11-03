import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { ReportStatus } from '../../../common/constants';

export class ListReportsQueryDto {
  @ApiPropertyOptional({
    enum: ReportStatus,
    description: 'Omit to list reports in every status',
  })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;
}
