import { randomUUID } from 'crypto';
import { mkdirSync } from 'fs';
import { BadRequestException } from '@nestjs/common';
import type { MulterOptions } from '@nestjs/platform-express/multer/interfaces/multer-options.interface';
import { diskStorage } from 'multer';
import {
  IMAGE_UPLOAD_MIME_EXTENSIONS,
  MAX_IMAGE_UPLOAD_BYTES,
} from './image-upload.constants';

// Multer config for a single-image upload route: stores the file on local disk
// under `dir` with a random name, accepts jpg/png/webp only, and caps the size
// at MAX_IMAGE_UPLOAD_BYTES. The stored filename is what the route persists —
// the file is served back only through an authenticated GET route, never a
// static path. Same mechanism as the NIC / profile-photo uploads.
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
