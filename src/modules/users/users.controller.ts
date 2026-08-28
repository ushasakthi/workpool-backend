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
