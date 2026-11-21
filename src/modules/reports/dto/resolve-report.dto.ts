import { IsEnum, IsIn, ValidateIf } from 'class-validator';
import { ReportSeverity, ReportStatus } from '../../../common/constants';

export class ResolveReportDto {
  @IsIn([ReportStatus.REVIEWED, ReportStatus.DISMISSED])
  status!: ReportStatus.REVIEWED | ReportStatus.DISMISSED;

  @ValidateIf((dto: ResolveReportDto) => dto.status === ReportStatus.REVIEWED)
  @IsEnum(ReportSeverity)
  severity?: ReportSeverity;
}
