import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';
import { PHONE_REGEX } from '../../../common/utils/validation-patterns';

export class UpdateEmergencyContactDto {
  @ApiProperty({ example: 'Amali Perera' })
  @IsString()
  @Matches(/\S/, { message: 'name cannot be blank' })
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: '+94771234567' })
  @Matches(PHONE_REGEX, {
    message: 'phone must be a valid phone number in international format',
  })
  phone!: string;
}
