import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import {
  IMAGE_UPLOAD_MIME_EXTENSIONS,
  MAX_IMAGE_UPLOAD_BYTES,
} from './image-upload.constants';

// Single image upload: random filename, jpg/png/webp, size limit.
// Files are only served through an authenticated route.
export function imageMulterOptions(dir: string): MulterOptions {
  return {
    storage: diskStorage({
      destination: (_req, _file, cb) => {
        mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        cb(
          null,
          `${randomUUID()}${IMAGE_UPLOAD_MIME_EXTENSIONS[file.mimetype]}`,
        );
      },
    }),
    fileFilter: (_req, file, cb) => {
      if (!IMAGE_UPLOAD_MIME_EXTENSIONS[file.mimetype]) {
        cb(
          new BadRequestException('file must be a jpg, png, or webp image'),
          false,
        );
        return;
      }
      cb(null, true);
    },
    limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES },
  };
}
