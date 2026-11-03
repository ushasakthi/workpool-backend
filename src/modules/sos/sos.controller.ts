import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateSosDto } from './dto/create-sos.dto';
import { SosService } from './sos.service';

@ApiTags('sos')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sos')
export class SosController {
  constructor(private readonly sosService: SosService) {}

  @ApiOperation({
    summary:
      'Record an SOS on an accepted ride and get the message for the emergency contact (FR17)',
  })
  @Post()
  trigger(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSosDto) {
    return this.sosService.trigger(user.userId, dto.bookingId);
  }
}
