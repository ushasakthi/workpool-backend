import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SuspendUserDto {
  @IsBoolean()
  suspended!: boolean;

  // required when suspending (checked in AdminService, one clear message)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
