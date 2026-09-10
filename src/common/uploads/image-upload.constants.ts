// Shared limits for user-uploaded images (profile photos, vehicle photos).
// Images only — no PDF (unlike NIC documents, see users/nic-upload.constants.ts).
export const MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024;

export const IMAGE_UPLOAD_MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};
