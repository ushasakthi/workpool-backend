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
  @IsString()
  @Matches(NIC_REGEX, {
    message:
      'nicNumber must be a valid Sri Lankan NIC (9 digits + V/X, or 12 digits)',
  })
  nicNumber: string;

  @IsString()
  @Matches(LINKEDIN_URL_REGEX, {
    message: 'linkedinUrl must be a linkedin.com profile URL',
  })
  linkedinUrl: string;

  // form fields arrive as text, so this is 'true' / 'false'
  @IsOptional()
  @IsBooleanString()
  submitAnyway?: string;
}
