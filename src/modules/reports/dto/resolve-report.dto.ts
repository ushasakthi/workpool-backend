import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsIn, ValidateIf } from 'class-validator';
import { ReportSeverity, ReportStatus } from '../../../common/constants';

export class ResolveReportDto {
  @ApiProperty({
    enum: [ReportStatus.REVIEWED, ReportStatus.DISMISSED],
    description:
      '"reviewed" = upheld (still counts against Trust Score), "dismissed" = unfounded (stops counting)',
  })
  @IsIn([ReportStatus.REVIEWED, ReportStatus.DISMISSED])
  status!: ReportStatus.REVIEWED | ReportStatus.DISMISSED;

  @ApiPropertyOptional({
    enum: ReportSeverity,
    description:
      'Required when status is "reviewed" (weighs the Trust Score penalty), ignored when "dismissed"',
  })
  @ValidateIf((dto: ResolveReportDto) => dto.status === ReportStatus.REVIEWED)
  @IsEnum(ReportSeverity)
  severity?: ReportSeverity;
}
