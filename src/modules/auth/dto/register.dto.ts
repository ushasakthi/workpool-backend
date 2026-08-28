import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../../common/constants';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REGEX,
  PHONE_REGEX,
} from '../../../common/utils/validation-patterns';

const SELF_REGISTERABLE_ROLES = [
  UserRole.PASSENGER,
  UserRole.DRIVER,
  UserRole.BOTH,
];

export class RegisterDto {
  @ApiProperty({ example: 'Nadeesha Perera' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'nadeesha@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongPass1' })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_REGEX, {
    message:
      'password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password!: string;

  @ApiProperty({ example: '+94771234567' })
  @Matches(PHONE_REGEX, {
    message: 'phone must be a valid phone number in international format',
  })
  phone!: string;

  @ApiPropertyOptional({
    enum: SELF_REGISTERABLE_ROLES,
    default: UserRole.PASSENGER,
  })
  @IsOptional()
  @IsIn(SELF_REGISTERABLE_ROLES)
  role?: UserRole;
}
