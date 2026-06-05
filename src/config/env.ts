const getEnv = (key: string, required = true): string => {
  const value = process.env[key];

  if (!value && required) {
    throw new Error(`Missing environment variable: ${key}`);
  }

  return value || '';
};

const env = {
  ENV: process.env.ENV || 'development',
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: Number(process.env.PORT) || 5000,

  CLIENT_URLS: getEnv('CLIENT_URLS'),
  COOKIE_DOMAIN:getEnv('COOKIE_DOMAIN'),
  MONGODB_URI: getEnv('MONGODB_URI'),
  JWT_TOKEN_SECRET: getEnv('JWT_TOKEN_SECRET'),

  WA_APP_KEY: getEnv('WA_APP_KEY'),
  WA_AUTH_KEY: getEnv('WA_AUTH_KEY'),
  WA_TEMPLATE_ID: getEnv('WA_TEMPLATE_ID'),
  WA_WELCOME_TEMPLATE_ID: getEnv('WA_WELCOME_TEMPLATE_ID'),
  WA_DEVICE_ID: getEnv('WA_DEVICE_ID'),
  WA_API_URL: getEnv('WA_API_URL'),

  SHIPROCKET_EMAIL: getEnv('SHIPROCKET_EMAIL'),
  SHIPROCKET_PASSWORD: getEnv('SHIPROCKET_PASSWORD'),
  SHIPROCKET_MOCK_MODE: process.env.SHIPROCKET_MOCK_MODE === 'true',

  SUPPORT_EMAIL: getEnv('SUPPORT_EMAIL'),

  RAZORPAY_KEY_ID: getEnv('RAZORPAY_KEY_ID'),
  RAZORPAY_KEY_SECRET: getEnv('RAZORPAY_KEY_SECRET'),
  RAZORPAY_WEBHOOK_SECRET: getEnv('RAZORPAY_WEBHOOK_SECRET'),

  CLOUDINARY_CLOUD_NAME: getEnv('CLOUDINARY_CLOUD_NAME'),
  CLOUDINARY_API_KEY: getEnv('CLOUDINARY_API_KEY'),
  CLOUDINARY_API_SECRET: getEnv('CLOUDINARY_API_SECRET'),
} as const;

export default env;
