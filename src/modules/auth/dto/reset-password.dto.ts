import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_REGEX,
} from '../../../common/utils/validation-patterns';

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_REGEX, {
    message:
      'newPassword must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  newPassword: string;
}
