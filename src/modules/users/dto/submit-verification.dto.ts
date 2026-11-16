import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBooleanString,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import {
  LINKEDIN_URL_REGEX,
  NIC_REGEX,
} from '../../../common/utils/validation-patterns';

export class SubmitVerificationDto {
  @ApiProperty({ example: '199912345678' })
  @IsString()
  @Matches(NIC_REGEX, {
    message:
      'nicNumber must be a valid Sri Lankan NIC (9 digits + V/X, or 12 digits)',
  })
  nicNumber: string;

  @ApiProperty({ example: 'https://www.linkedin.com/in/yourprofile' })
  @IsString()
  @Matches(LINKEDIN_URL_REGEX, {
    message: 'linkedinUrl must be a linkedin.com profile URL',
  })
  linkedinUrl: string;

  // form fields arrive as text, so this is 'true' / 'false'
  @ApiPropertyOptional({
    example: 'false',
    description: 'Submit even if the NIC number was not found on the photo',
  })
  @IsOptional()
  @IsBooleanString()
  submitAnyway?: string;
}
