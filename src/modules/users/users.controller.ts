import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SelfOrAdminGuard } from '../../common/guards/self-or-admin.guard';
import { SubmitVerificationDto } from './dto/submit-verification.dto';
import { UpdateEmergencyContactDto } from './dto/update-emergency-contact.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePushTokenDto } from './dto/update-push-token.dto';
import { UpdateTravelProfileDto } from './dto/update-travel-profile.dto';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @ApiOperation({ summary: "Get the current authenticated user's profile" })
  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.findMe(user.userId);
  }

  @ApiOperation({ summary: "Update the current user's name or phone" })
  @UseGuards(JwtAuthGuard)
  @Patch('me/profile')
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(user.userId, dto);
  }

  @ApiOperation({ summary: 'Set who to alert when pressing SOS (FR17)' })
  @UseGuards(JwtAuthGuard)
  @Patch('me/emergency-contact')
  updateEmergencyContact(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateEmergencyContactDto,
  ) {
    return this.usersService.updateEmergencyContact(user.userId, dto);
  }

  @ApiOperation({
    summary: "Save this phone's Expo push token (Android notifications)",
  })
  @UseGuards(JwtAuthGuard)
  @Patch('me/push-token')
  async updatePushToken(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePushTokenDto,
  ) {
    await this.usersService.setPushToken(user.userId, dto.token);
    return { message: 'Push token saved.' };
  }

  @ApiOperation({
    summary: "Upload or replace the current user's profile photo",
  })
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('photo'))
  @HttpCode(HttpStatus.OK)
  @Patch('me/photo')
  updateProfilePhoto(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('photo file is required');
    }
    return this.usersService.updateProfilePhoto(user.userId, file.filename);
  }

  @ApiOperation({
    summary:
      "Update the current user's travel profile (commute locations, schedule, availability)",
  })
  @UseGuards(JwtAuthGuard)
  @Patch('me/travel-profile')
  updateTravelProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateTravelProfileDto,
  ) {
    return this.usersService.updateTravelProfile(user.userId, dto);
  }

  @ApiOperation({
    summary:
      "Get another user's public profile — approximate home/work location only, never exact coordinates",
  })
  @UseGuards(JwtAuthGuard)
  @Get(':userId/profile')
  getPublicProfile(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.usersService.getPublicProfile(userId, user.userId);
  }

  @ApiOperation({ summary: "Fetch a user's profile photo" })
  @UseGuards(JwtAuthGuard)
  @Get(':userId/photo')
  async getProfilePhoto(
    @Param('userId') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    const filePath = await this.usersService.resolveProfilePhotoPath(userId);
    res.sendFile(filePath);
  }

  @ApiOperation({
    summary:
      'Submit NIC + LinkedIn details for identity/workplace verification',
  })
  @ApiConsumes('multipart/form-data')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('nicDocument'))
  @HttpCode(HttpStatus.OK)
  @Patch('me/verification')
  async submitVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitVerificationDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('nicDocument file is required');
    }

    await this.usersService.submitVerification(user.userId, {
      nicNumber: dto.nicNumber,
      linkedinUrl: dto.linkedinUrl,
      nicDocumentUrl: file.filename,
    });

    return { message: 'Verification submitted and pending admin review.' };
  }

  @ApiOperation({
    summary: "Fetch a user's uploaded NIC document (owner or admin only)",
  })
  @UseGuards(JwtAuthGuard, SelfOrAdminGuard)
  @Get(':userId/nic-document')
  async getNicDocument(
    @Param('userId') userId: string,
    @Res() res: Response,
  ): Promise<void> {
    const filePath = await this.usersService.resolveNicDocumentPath(userId);
    res.sendFile(filePath);
  }
}
