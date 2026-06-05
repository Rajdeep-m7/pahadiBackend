import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import fs from 'fs/promises';
import env from '@/config/env';
import { UploadFileResult } from '@/api/v1/interfaces/cloudinary.interface';

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

class CloudinaryService {
  private readonly rootFolder = 'mscliq';

  /**
   * Uploads a file to Cloudinary and removes the local temporary file.
   * @param tempFilePath - The local path where express-fileupload saved the file.
   * @param targetFolder - The Cloudinary sub-folder (e.g., 'products', 'brands').
   * @param mimeType - Mime type of the file.
   */
  async uploadFile(
    tempFilePath: string,
    targetFolder: string = 'general',
    mimeType: string
  ): Promise<UploadFileResult> {
    try {
      let resourceType: 'image' | 'video' | 'raw' | 'auto' = 'auto';

      if (mimeType.startsWith('image/')) {
        resourceType = 'image';
      } else if (mimeType.startsWith('video/')) {
        resourceType = 'video';
      } else {
        throw new Error(`Unsupported file type: ${mimeType}. Only images and videos are allowed.`);
      }

      const result: UploadFileResult = (await cloudinary.uploader.upload(tempFilePath, {
        folder: `${this.rootFolder}/${targetFolder}`,
        resource_type: resourceType,
      })) as UploadFileResult;

      await fs.unlink(tempFilePath);
      return result;
    } catch (error) {
      try {
        await fs.unlink(tempFilePath);
      } catch (cleanupError) {
        console.error('[CloudinaryService] Error cleaning up temp file:', cleanupError);
      }

      console.error('[CloudinaryService] Error uploading file:', error);
      throw new Error(error instanceof Error ? error.message : 'File upload failed0', {
        cause: error,
      });
    }
  }

  /**
   * Deletes a file from Cloudinary using its public_id.
   * Note: Cloudinary requires the resource_type to delete videos.
   */
  async deleteFile(publicId: string, isVideo: boolean = false): Promise<UploadApiResponse> {
    try {
      const resourceType = isVideo ? 'video' : 'image';
      return await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    } catch (error) {
      console.error('[CloudinaryService] Error deleting file:', error);
      throw new Error('File deletion failed', { cause: error });
    }
  }
}

export const cloudinaryService = new CloudinaryService();
