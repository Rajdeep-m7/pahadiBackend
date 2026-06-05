import { Router } from 'express';
import {
  getStorefrontData,
  createBanner,
  getAllBanners,
  updateBanner,
  deleteBanner,
  createVideo,
  getAllVideos,
  updateVideo,
  deleteVideo,
  createPopup,
  getAllPopups,
  updatePopup,
  deletePopup,
} from '@/api/v1/controllers/storefront.controller';
import { protect, restrictTo } from '@/api/v1/middlewares/auth.middleware';

const router = Router();

// ==========================================
// PUBLIC ROUTES
// ==========================================
router.get('/', getStorefrontData);

// ==========================================
// ADMIN ROUTES
// ==========================================
router.use(protect);
router.use(restrictTo('admin', 'staff'));

// Banners
router.get('/banners', getAllBanners);
router.post('/banners', createBanner);
router.patch('/banners/:id', updateBanner);
router.delete('/banners/:id', restrictTo('admin'), deleteBanner);

// Videos
router.get('/videos', getAllVideos);
router.post('/videos', createVideo);
router.patch('/videos/:id', updateVideo);
router.delete('/videos/:id', restrictTo('admin'), deleteVideo);

// Popups
router.get('/popups', getAllPopups);
router.post('/popups', createPopup);
router.patch('/popups/:id', updatePopup);
router.delete('/popups/:id', restrictTo('admin'), deletePopup);

export default router;
