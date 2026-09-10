import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { imageMulterOptions } from '../../common/uploads/image-multer.config';
import { AppConfig } from '../../config/configuration';
import { VehicleOwnerGuard } from './guards/vehicle-owner.guard';
import { Vehicle, VehicleSchema } from './schemas/vehicle.schema';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Vehicle.name, schema: VehicleSchema }]),
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) =>
        imageMulterOptions(
          configService.get('uploads', { infer: true }).vehiclePhotoDir,
        ),
    }),
  ],
  controllers: [VehiclesController],
  providers: [VehiclesService, VehicleOwnerGuard],
  exports: [VehiclesService],
})
export class VehiclesModule {}
