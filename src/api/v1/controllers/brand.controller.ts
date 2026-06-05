import { Request, Response, NextFunction } from 'express';
import { Brand } from '@/api/v1/models/brand.model';
import { Product } from '@/api/v1/models/product.model';
import { cloudinaryService } from '@/api/v1/services/cloudinary.service';
import { httpError } from '@/api/v1/utils/httpError';
import httpResponse from '@/api/v1/utils/httpResponse';
import { UploadedFile } from 'express-fileupload';
import { validateFileSize } from '@/api/v1/utils/fileValidation';

// ==========================================
// CREATE BRAND
// ==========================================
export const createBrand = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name } = req.body;

    let uploadResult;
    if (req.files && req.files.logo) {
      const logo = req.files.logo as UploadedFile;
      validateFileSize(logo);

      uploadResult = await cloudinaryService.uploadFile(
        logo.tempFilePath,
        'brands',
        logo.mimetype
      );
    }

    const newBrand = await Brand.create({
      name,
      logoUrl: uploadResult?.secure_url,
      logoPublicId: uploadResult?.public_id,
    });

    return httpResponse(req, res, 201, 'Brand created successfully', newBrand);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// GET ALL BRANDS
// ==========================================
export const getAllBrands = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search } = req.query;
    let filter = {};

    if (search) {
      filter = { name: { $regex: search, $options: 'i' } };
    }

    const brands = await Brand.find(filter).sort({ name: 1 });

    return httpResponse(req, res, 200, 'Brands fetched successfully', brands);
  } catch (error: unknown) {
    return httpError(next, error, req, 500);
  }
};

// ==========================================
// GET BRAND BY ID
// ==========================================
export const getBrandById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) throw new Error('Brand not found');

    return httpResponse(req, res, 200, 'Brand fetched successfully', brand);
  } catch (error: unknown) {
    return httpError(next, error, req, 404);
  }
};

// ==========================================
// UPDATE BRAND
// ==========================================
export const updateBrand = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { name } = req.body;

    const brand = await Brand.findById(id);
    if (!brand) throw new Error('Brand not found');

    if (name) brand.name = name;

    if (req.files && req.files.logo) {
      const logo = req.files.logo as UploadedFile;
      validateFileSize(logo);

      // Delete old logo if exists
      if (brand.logoPublicId) {
        await cloudinaryService.deleteFile(brand.logoPublicId);
      }

      const uploadResult = await cloudinaryService.uploadFile(
        logo.tempFilePath,
        'brands',
        logo.mimetype
      );
      brand.logoUrl = uploadResult.secure_url;
      brand.logoPublicId = uploadResult.public_id;
    }

    await brand.save();

    return httpResponse(req, res, 200, 'Brand updated successfully', brand);
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};

// ==========================================
// DELETE BRAND
// ==========================================
export const deleteBrand = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // 1. Check if any product is linked to this brand
    const linkedProductsCount = await Product.countDocuments({ brandId: id });
    if (linkedProductsCount > 0) {
      throw new Error(`Cannot delete brand. It is linked to ${linkedProductsCount} product(s).`);
    }

    const brand = await Brand.findById(id);
    if (!brand) throw new Error('Brand not found');

    // 2. Delete logo from Cloudinary
    if (brand.logoPublicId) {
      await cloudinaryService.deleteFile(brand.logoPublicId);
    }

    // 3. Delete from DB
    await Brand.findByIdAndDelete(id);

    return httpResponse(req, res, 200, 'Brand deleted successfully');
  } catch (error: unknown) {
    return httpError(next, error, req, 400);
  }
};
