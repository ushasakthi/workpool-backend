import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { ReverseGeocodeQueryDto } from './dto/reverse-geocode-query.dto';
import { GeocodeService } from './geocode.service';

@ApiTags('geocode')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('geocode')
export class GeocodeController {
  constructor(private readonly geocodeService: GeocodeService) {}

  @ApiOperation({ summary: 'Approximate area name for a map point' })
  @Get('reverse')
  reverse(@Query() query: ReverseGeocodeQueryDto) {
    return this.geocodeService.reverse(query.lat, query.lng);
  }
}
