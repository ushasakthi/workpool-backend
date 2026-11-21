import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateSosDto } from './dto/create-sos.dto';
import { SosService } from './sos.service';

@UseGuards(JwtAuthGuard)
@Controller('sos')
export class SosController {
  constructor(private readonly sosService: SosService) {}

  @Post()
  trigger(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateSosDto) {
    return this.sosService.trigger(user.userId, dto.bookingId);
  }
}
