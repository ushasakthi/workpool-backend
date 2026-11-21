import { IsString, Matches, MaxLength } from 'class-validator';
import { PHONE_REGEX } from '../../../common/utils/validation-patterns';

export class UpdateEmergencyContactDto {
  @IsString()
  @Matches(/\S/, { message: 'name cannot be blank' })
  @MaxLength(100)
  name!: string;

  @Matches(PHONE_REGEX, {
    message: 'phone must be a valid phone number in international format',
  })
  phone!: string;
}
