import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { BadRequestException, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { AppConfig } from '../../config/configuration';
import {
  MAX_NIC_FILE_SIZE_BYTES,
  NIC_FILE_EXTENSIONS,
} from './nic-upload.constants';
import {
  MAX_PROFILE_PHOTO_SIZE_BYTES,
  PROFILE_PHOTO_EXTENSIONS,
} from './profile-photo.constants';
import { AdminLogModule } from '../admin-log/admin-log.module';
import { TrustScoreModule } from '../trust-score/trust-score.module';
import { NicCheckService } from './nic-check.service';
import { User, UserSchema } from './schemas/user.schema';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

// NIC and photo uploads share one Multer config
const isPhotoField = (file: { fieldname: string }) =>
  file.fieldname === 'photo';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    TrustScoreModule,
    AdminLogModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        storage: diskStorage({
          destination: (_req, file, cb) => {
            const { nicDocumentDir, profilePhotoDir } = configService.get(
              'uploads',
              { infer: true },
            );
            const dir = isPhotoField(file) ? profilePhotoDir : nicDocumentDir;
            mkdirSync(dir, { recursive: true });
            cb(null, dir);
          },
          filename: (_req, file, cb) => {
            const extensions = isPhotoField(file)
              ? PROFILE_PHOTO_EXTENSIONS
              : NIC_FILE_EXTENSIONS;
            cb(null, `${randomUUID()}${extensions[file.mimetype]}`);
          },
        }),
        fileFilter: (_req, file, cb) => {
          const extensions = isPhotoField(file)
            ? PROFILE_PHOTO_EXTENSIONS
            : NIC_FILE_EXTENSIONS;
          if (!extensions[file.mimetype]) {
            cb(
              new BadRequestException(
                isPhotoField(file)
                  ? 'photo must be a jpg, png, or webp image'
                  : 'nicDocument must be a jpg, png, or pdf file',
              ),
              false,
            );
            return;
          }
          cb(null, true);
        },
        limits: {
          fileSize: Math.max(
            MAX_NIC_FILE_SIZE_BYTES,
            MAX_PROFILE_PHOTO_SIZE_BYTES,
          ),
        },
      }),
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService, NicCheckService],
  exports: [UsersService],
})
export class UsersModule {}
