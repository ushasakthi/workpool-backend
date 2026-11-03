import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SuspendUserDto {
  @ApiProperty({ description: 'true = suspend, false = lift the suspension' })
  @IsBoolean()
  suspended!: boolean;

  // required when suspending (checked in AdminService, one clear message)
  @ApiPropertyOptional({ example: 'Repeated no-shows after warnings' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
