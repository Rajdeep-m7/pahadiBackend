import { Router } from 'express';
import { getHomeStorefront } from '@/api/v1/controllers/home.controller';

const router = Router();

router.get('/', getHomeStorefront);

export default router;
