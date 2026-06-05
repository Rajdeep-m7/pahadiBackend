import { Request, Response, NextFunction } from 'express';
import { Banner } from '@/api/v1/models/banner.model';
import { Video } from '@/api/v1/models/video.model';
import { Popup } from '@/api/v1/models/popup.model';
import { cloudinaryService } from '@/api/v1/services/cloudinary.service';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';
import { UploadedFile } from 'express-fileupload';
import { validateFileSize } from '@/api/v1/utils/fileValidation';

// ==========================================
// PUBLIC: GET STOREFRONT DATA
// ==========================================
export const getStorefrontData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [banners, videos, popup] = await Promise.all([
      Banner.find({ isActive: true }).sort({ sortOrder: 1 }),
      Video.find({ isActive: true }).sort({ sortOrder: 1 }),
      Popup.findOne({ isActive: true }).sort({ updatedAt: -1 }),
    ]);

    return httpResponse(req, res, 200, 'Storefront data fetched successfully', {
      banners,
      videos,
      popup,
    });
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// ADMIN: BANNERS
// ==========================================
export const createBanner = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, link, isActive, sortOrder } = req.body;

    if (!req.files || !req.files.desktopImage || !req.files.mobileImage) {
      throw new Error('Both desktop and mobile images are required');
    }

    const desktopFile = req.files.desktopImage as UploadedFile;
    const mobileFile = req.files.mobileImage as UploadedFile;

    validateFileSize(desktopFile);
    validateFileSize(mobileFile);

    const [desktopUpload, mobileUpload] = await Promise.all([
      cloudinaryService.uploadFile(desktopFile.tempFilePath, 'banners', desktopFile.mimetype),
      cloudinaryService.uploadFile(mobileFile.tempFilePath, 'banners', mobileFile.mimetype),
    ]);

    const banner = await Banner.create({
      title,
      link,
      isActive: isActive === 'true' || isActive === true,
      sortOrder: Number(sortOrder) || 0,
      desktopImage: {
        url: desktopUpload.secure_url,
        publicId: desktopUpload.public_id,
      },
      mobileImage: {
        url: mobileUpload.secure_url,
        publicId: mobileUpload.public_id,
      },
    });

    return httpResponse(req, res, 201, 'Banner created successfully', banner);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

export const getAllBanners = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const banners = await Banner.find().sort({ sortOrder: 1 });
    return httpResponse(req, res, 200, 'Banners fetched successfully', banners);
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

export const updateBanner = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { title, link, isActive, sortOrder } = req.body;

    const banner = await Banner.findById(id);
    if (!banner) throw new Error('Banner not found');

    if (title) banner.title = title;
    if (link !== undefined) banner.link = link;
    if (isActive !== undefined) banner.isActive = isActive === 'true' || isActive === true;
    if (sortOrder !== undefined) banner.sortOrder = Number(sortOrder) || 0;

    if (req.files) {
      if (req.files.desktopImage) {
        const desktopFile = req.files.desktopImage as UploadedFile;
        validateFileSize(desktopFile);
        await cloudinaryService.deleteFile(banner.desktopImage.publicId);
        const desktopUpload = await cloudinaryService.uploadFile(desktopFile.tempFilePath, 'banners', desktopFile.mimetype);
        banner.desktopImage = { url: desktopUpload.secure_url, publicId: desktopUpload.public_id };
      }
      if (req.files.mobileImage) {
        const mobileFile = req.files.mobileImage as UploadedFile;
        validateFileSize(mobileFile);
        await cloudinaryService.deleteFile(banner.mobileImage.publicId);
        const mobileUpload = await cloudinaryService.uploadFile(mobileFile.tempFilePath, 'banners', mobileFile.mimetype);
        banner.mobileImage = { url: mobileUpload.secure_url, publicId: mobileUpload.public_id };
      }
    }

    await banner.save();
    return httpResponse(req, res, 200, 'Banner updated successfully', banner);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

export const deleteBanner = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) throw new Error('Banner not found');

    await Promise.all([
      cloudinaryService.deleteFile(banner.desktopImage.publicId),
      cloudinaryService.deleteFile(banner.mobileImage.publicId),
    ]);

    await Banner.findByIdAndDelete(req.params.id);
    return httpResponse(req, res, 200, 'Banner deleted successfully');
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// ADMIN: VIDEOS
// ==========================================
export const createVideo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, isActive, sortOrder } = req.body;

    if (!req.files || !req.files.video) {
      throw new Error('Video file is required');
    }

    const videoFile = req.files.video as UploadedFile;

    const videoUpload = await cloudinaryService.uploadFile(videoFile.tempFilePath, 'videos', videoFile.mimetype);

    const video = await Video.create({
      title,
      isActive: isActive === 'true' || isActive === true,
      sortOrder: Number(sortOrder) || 0,
      video: {
        url: videoUpload.secure_url,
        publicId: videoUpload.public_id,
      },
    });

    return httpResponse(req, res, 201, 'Video created successfully', video);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

export const getAllVideos = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const videos = await Video.find().sort({ sortOrder: 1 });
    return httpResponse(req, res, 200, 'Videos fetched successfully', videos);
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

export const updateVideo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { title, isActive, sortOrder } = req.body;

    const videoDoc = await Video.findById(id);
    if (!videoDoc) throw new Error('Video not found');

    if (title) videoDoc.title = title;
    if (isActive !== undefined) videoDoc.isActive = isActive === 'true' || isActive === true;
    if (sortOrder !== undefined) videoDoc.sortOrder = Number(sortOrder) || 0;

    if (req.files && req.files.video) {
      const videoFile = req.files.video as UploadedFile;
      await cloudinaryService.deleteFile(videoDoc.video.publicId, true);
      const videoUpload = await cloudinaryService.uploadFile(videoFile.tempFilePath, 'videos', videoFile.mimetype);
      videoDoc.video = { url: videoUpload.secure_url, publicId: videoUpload.public_id };
    }

    await videoDoc.save();
    return httpResponse(req, res, 200, 'Video updated successfully', videoDoc);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

export const deleteVideo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const videoDoc = await Video.findById(req.params.id);
    if (!videoDoc) throw new Error('Video not found');

    await cloudinaryService.deleteFile(videoDoc.video.publicId, true);
    await Video.findByIdAndDelete(req.params.id);

    return httpResponse(req, res, 200, 'Video deleted successfully');
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// ADMIN: POPUP
// ==========================================
export const createPopup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { title, link, isActive } = req.body;

    if (!req.files || !req.files.image) {
      throw new Error('Popup image is required');
    }

    const imageFile = req.files.image as UploadedFile;
    validateFileSize(imageFile);

    const imageUpload = await cloudinaryService.uploadFile(imageFile.tempFilePath, 'popups', imageFile.mimetype);

    if (isActive === 'true' || isActive === true) {
      await Popup.updateMany({}, { isActive: false });
    }

    const popup = await Popup.create({
      title,
      link,
      isActive: isActive === 'true' || isActive === true,
      image: {
        url: imageUpload.secure_url,
        publicId: imageUpload.public_id,
      },
    });

    return httpResponse(req, res, 201, 'Popup created successfully', popup);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

export const getAllPopups = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const popups = await Popup.find().sort({ createdAt: -1 });
    return httpResponse(req, res, 200, 'Popups fetched successfully', popups);
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

export const updatePopup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { title, link, isActive } = req.body;

    const popup = await Popup.findById(id);
    if (!popup) throw new Error('Popup not found');

    if (title) popup.title = title;
    if (link !== undefined) popup.link = link;
    
    if (isActive !== undefined) {
      const activeStatus = isActive === 'true' || isActive === true;
      if (activeStatus) {
        await Popup.updateMany({ _id: { $ne: id } }, { isActive: false });
      }
      popup.isActive = activeStatus;
    }

    if (req.files && req.files.image) {
      const imageFile = req.files.image as UploadedFile;
      validateFileSize(imageFile);
      await cloudinaryService.deleteFile(popup.image.publicId);
      const imageUpload = await cloudinaryService.uploadFile(imageFile.tempFilePath, 'popups', imageFile.mimetype);
      popup.image = { url: imageUpload.secure_url, publicId: imageUpload.public_id };
    }

    await popup.save();
    return httpResponse(req, res, 200, 'Popup updated successfully', popup);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

export const deletePopup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const popup = await Popup.findById(req.params.id);
    if (!popup) throw new Error('Popup not found');

    await cloudinaryService.deleteFile(popup.image.publicId);
    await Popup.findByIdAndDelete(req.params.id);

    return httpResponse(req, res, 200, 'Popup deleted successfully');
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};
