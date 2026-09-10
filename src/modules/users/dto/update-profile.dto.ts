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

// All fields optional — this is a partial update. The photo is set separately via the
// multipart PATCH /users/me/photo route.
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

  // Lets a user switch between finding rides / offering rides / both. `admin` is
  // never self-assignable.
  @ApiPropertyOptional({ enum: SELF_ASSIGNABLE_ROLES })
  @IsOptional()
  @IsIn(SELF_ASSIGNABLE_ROLES)
  role?: UserRole;
}
