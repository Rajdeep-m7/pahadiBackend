import { CookieOptions } from 'express';
import env from '@/config/env';

export const getCookieOptions = (): CookieOptions => {
  const isProd = env.NODE_ENV === 'production';
  
  const options: CookieOptions = {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: 60 * 24 * 60 * 60 * 1000, // 60 days
  };

  // if (env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== 'localhost') {
  //   options.domain = env.COOKIE_DOMAIN;
  // }

  return options;
};

export const getLogoutCookieOptions = (): CookieOptions => {
  const isProd = env.NODE_ENV === 'production';
  
  const options: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
  };

  if (env.COOKIE_DOMAIN && env.COOKIE_DOMAIN !== 'localhost') {
    options.domain = env.COOKIE_DOMAIN;
  }

  return options;
};
