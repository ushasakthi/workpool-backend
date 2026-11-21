import { IsString, Matches } from 'class-validator';

export class UpdatePushTokenDto {
  @IsString()
  @Matches(/^ExponentPushToken\[.+\]$/, {
    message: 'token must be an Expo push token',
  })
  token!: string;
}
