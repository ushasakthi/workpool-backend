import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class VerifyPickupDto {
  @ApiProperty({
    example: '4821',
    description: 'The 4-digit PIN the passenger shows at pickup',
  })
  @Matches(/^\d{4}$/, { message: 'pin must be 4 digits' })
  pin!: string;
}
