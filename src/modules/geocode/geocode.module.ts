import { Module } from '@nestjs/common';
import { GeocodeController } from './geocode.controller';
import { GeocodeService } from './geocode.service';

@Module({
  controllers: [GeocodeController],
  providers: [GeocodeService],
  // the backfill script uses it too
  exports: [GeocodeService],
})
export class GeocodeModule {}
