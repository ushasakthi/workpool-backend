import {
  Equals,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SELF_ASSIGNABLE_ROLES, UserRole } from '../../../common/constants';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REGEX,
  PHONE_REGEX,
} from '../../../common/utils/validation-patterns';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_REGEX, {
    message:
      'password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password!: string;

  @Matches(PHONE_REGEX, {
    message: 'phone must be a valid phone number in international format',
  })
  phone!: string;

  @IsOptional()
  @IsIn(SELF_ASSIGNABLE_ROLES)
  role?: UserRole;

  // must be exactly true: no account without agreeing it's cost-sharing, not hire
  @Equals(true, {
    message: 'You must accept the Terms & Conditions to create an account',
  })
  acceptedTerms!: boolean;
}
