import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UserRole } from '../../common/constants';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { VehicleOwnerGuard } from './guards/vehicle-owner.guard';
import { VehiclesService } from './vehicles.service';

@Controller('vehicles')
export class VehiclesController {
  constructor(private readonly vehiclesService: VehiclesService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DRIVER, UserRole.BOTH)
  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateVehicleDto,
  ) {
    return this.vehiclesService.create(user.userId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  findMine(@CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.findMine(user.userId);
  }

  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehiclesService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard, VehicleOwnerGuard)
  @UseInterceptors(FileInterceptor('photo'))
  @HttpCode(HttpStatus.OK)
  @Patch(':id/photo')
  updatePhoto(
    @Param('id') id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('photo file is required');
    }
    return this.vehiclesService.updatePhoto(id, file.filename);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id/photo')
  async getPhoto(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const filePath = await this.vehiclesService.resolveVehiclePhotoPath(id);
    res.sendFile(filePath);
  }
}
