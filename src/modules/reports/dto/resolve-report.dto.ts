import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ReportStatus } from '../../../common/constants';

export class ResolveReportDto {
  @ApiProperty({
    enum: [ReportStatus.REVIEWED, ReportStatus.DISMISSED],
    description:
      '"reviewed" = upheld (still counts against Trust Score), "dismissed" = unfounded (stops counting)',
  })
  @IsIn([ReportStatus.REVIEWED, ReportStatus.DISMISSED])
  status!: ReportStatus.REVIEWED | ReportStatus.DISMISSED;
}
