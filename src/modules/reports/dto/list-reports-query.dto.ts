import { IsEnum, IsOptional } from 'class-validator';
import { ReportStatus } from '../../../common/constants';

export class ListReportsQueryDto {
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;
}
