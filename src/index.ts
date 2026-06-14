import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import fileUpload from 'express-fileupload';

import env from '@/config/env';
import { connectDB } from '@/config/db';
import { gracefullyShutdown } from '@/config/server';
import { startOrderExpiryPolling } from '@/api/v1/services/orderExpiry.service';
// import { type tHttpError } from "@/api/v1/interfaces/http";
import { EApplicationEnvironment, responseMessage } from '@/constant';
import { httpError } from '@/api/v1/utils/httpError';
import { globalErrorHandler } from '@/api/v1/middlewares/globalErrorHandler.middleware';
import httpResponse from '@/api/v1/utils/httpResponse';
import { AuthRequest } from '@/api/v1/interfaces/auth.interface';
import agenda, { initAgenda } from '@/config/agenda';

import authRoutes from '@/api/v1/routes/auth.route';
import userRoutes from '@/api/v1/routes/user.route';
import warehouseRoutes from '@/api/v1/routes/warehouse.route';
import brandRoutes from '@/api/v1/routes/brand.route';
import categoryRoutes from '@/api/v1/routes/category.route';
import productRoutes from '@/api/v1/routes/product.route';
import variantRoutes from '@/api/v1/routes/variant.route';
import cartRoutes from '@/api/v1/routes/cart.route';
import wishlistRoutes from '@/api/v1/routes/wishlist.route';
import orderRoutes from '@/api/v1/routes/order.route';
import transactionRoutes from '@/api/v1/routes/transaction.route';
import returnReplaceRoutes from '@/api/v1/routes/returnReplace.route';
import addressRoutes from '@/api/v1/routes/address.route';
import shiprocketRoutes from '@/api/v1/routes/shiprocket.route';
import homeRoutes from '@/api/v1/routes/home.route';
import couponRoutes from '@/api/v1/routes/coupon.route';
import reviewRoutes from '@/api/v1/routes/review.route';
import storefrontRoutes from '@/api/v1/routes/storefront.route';
import notificationRoutes from '@/api/v1/routes/notification.route';

const app = express();

const allowedOrigins = env.CLIENT_URLS ? env.CLIENT_URLS.split(',') : [];

const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);

    if (env.ENV === EApplicationEnvironment.DEVELOPMENT || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Credentials'],
};

app.use(cors(corsOptions));

app.use(
  fileUpload({
    useTempFiles: true,
    tempFileDir: '/tmp/',
  })
);

app.use(
  express.json({
    verify: (req: AuthRequest, _res, buf) => {
      if (req.originalUrl.includes('/webhook')) {
        req.rawBody = buf;
      }
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/', (req, res) => {
  return httpResponse(req, res, 200, 'Server is running');
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/warehouses', warehouseRoutes);
app.use('/api/v1/brands', brandRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/variants', variantRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/wishlist', wishlistRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/payments', transactionRoutes);
app.use('/api/v1/returns', returnReplaceRoutes);
app.use('/api/v1/addresses', addressRoutes);
app.use('/api/v1/shiprocket', shiprocketRoutes);
app.use('/api/v1/home', homeRoutes);
app.use('/api/v1/coupons', couponRoutes);
app.use('/api/v1/reviews', reviewRoutes);
app.use('/api/v1/storefront', storefrontRoutes);
app.use('/api/v1/notifications', notificationRoutes);

app.use((req: Request, _: Response, next: NextFunction) => {
  try {
    throw new Error(responseMessage.NOT_FOUND('Route'));
  } catch (error) {
    httpError(next, error, req, 404);
  }
});

app.use(globalErrorHandler);

const startServer = async () => {
  console.log('[•] Starting server initialization...');
  try {
    await connectDB();

    console.log('[•] Starting order expiry polling...');
    startOrderExpiryPolling();

    console.log('[•] Starting express server...');
    const server = app.listen(env.PORT, async () => {
      console.log(`[✔] Server running on port ${env.PORT} in ${env.ENV} mode`);
      
      // Initialize Agenda AFTER the server is up to ensure it doesn't block startup
      // and has a stable DB connection.
      try {
        await initAgenda();
      } catch (err) {
        console.error('[✖] Background Agenda initialization failed:', err);
      }
    });

    process.on('SIGINT', () => gracefullyShutdown(server, mongoose, agenda));
    process.on('SIGTERM', () => gracefullyShutdown(server, mongoose, agenda));

    process.on('uncaughtException', (error) => {
      console.error('[✖] Uncaught Exception:', error);
      gracefullyShutdown(server, mongoose, agenda);
    });
  } catch (error) {
    console.error('[✖] Critical server startup error:', error);
    process.exit(1);
  }
};

startServer();
