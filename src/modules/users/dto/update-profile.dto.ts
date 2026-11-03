import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { SELF_ASSIGNABLE_ROLES, UserRole } from '../../../common/constants';
import { PHONE_REGEX } from '../../../common/utils/validation-patterns';

// photo uses PATCH /users/me/photo
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Nadeesha Perera' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ example: '+94771234567' })
  @IsOptional()
  @Matches(PHONE_REGEX, {
    message: 'phone must be a valid phone number in international format',
  })
  phone?: string;

  // admin can't be self-assigned
  @ApiPropertyOptional({ enum: SELF_ASSIGNABLE_ROLES })
  @IsOptional()
  @IsIn(SELF_ASSIGNABLE_ROLES)
  role?: UserRole;
}
