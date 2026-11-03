import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

export class SavingsQueryDto {
  @ApiPropertyOptional({
    example: '2026-10',
    description: 'Month as YYYY-MM (Colombo time), defaults to this month',
  })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be YYYY-MM' })
  month?: string;
}
