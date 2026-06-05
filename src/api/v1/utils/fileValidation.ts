import { UploadedFile } from 'express-fileupload';
import { MAX_IMAGE_SIZE, MAX_IMAGE_SIZE_MB } from '@/constant';

/**
 * Validates the size of an uploaded file or array of files.
 * Throws an error if any file exceeds the maximum allowed size.
 */
export const validateFileSize = (files: UploadedFile | UploadedFile[]) => {
  const fileArray = Array.isArray(files) ? files : [files];

  for (const file of fileArray) {
    if (file.size > MAX_IMAGE_SIZE) {
      throw new Error(`File "${file.name}" exceeds the maximum size limit of ${MAX_IMAGE_SIZE_MB}MB`);
    }
  }
};
