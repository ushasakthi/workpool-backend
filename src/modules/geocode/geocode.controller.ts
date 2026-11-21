import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ReverseGeocodeQueryDto } from './dto/reverse-geocode-query.dto';
import { GeocodeService } from './geocode.service';

@UseGuards(JwtAuthGuard)
@Controller('geocode')
export class GeocodeController {
  constructor(private readonly geocodeService: GeocodeService) {}

  @Get('reverse')
  reverse(@Query() query: ReverseGeocodeQueryDto) {
    return this.geocodeService.reverse(query.lat, query.lng);
  }
}
