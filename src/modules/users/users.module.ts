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
import { User, UserSchema } from './schemas/user.schema';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        storage: diskStorage({
          destination: (_req, _file, cb) => {
            const { nicDocumentDir } = configService.get('uploads', {
              infer: true,
            });
            mkdirSync(nicDocumentDir, { recursive: true });
            cb(null, nicDocumentDir);
          },
          filename: (_req, file, cb) => {
            cb(null, `${randomUUID()}${NIC_FILE_EXTENSIONS[file.mimetype]}`);
          },
        }),
        fileFilter: (_req, file, cb) => {
          if (!NIC_FILE_EXTENSIONS[file.mimetype]) {
            cb(
              new BadRequestException(
                'nicDocument must be a jpg, png, or pdf file',
              ),
              false,
            );
            return;
          }
          cb(null, true);
        },
        limits: { fileSize: MAX_NIC_FILE_SIZE_BYTES },
      }),
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
