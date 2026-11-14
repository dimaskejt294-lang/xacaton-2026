import dotenv from 'dotenv';
import crypto from 'node:crypto';
import path from 'node:path';

dotenv.config();

export interface AppConfig {
  port: number;
  appUrl: string;
  masterPassword: string;
  sessionSecret: string;
  yookassaShopId: string;
  yookassaSecretKey: string;
  databasePath: string;
  uploadsDir: string;
  isProduction: boolean;
}

const rawPort = Number(process.env.PORT ?? '3000');

export const config: AppConfig = {
  port: Number.isFinite(rawPort) && rawPort > 0 ? rawPort : 3000,
  appUrl: (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  masterPassword: (process.env.MASTER_PASSWORD ?? '').trim(),
  sessionSecret:
    (process.env.SESSION_SECRET ?? '').trim() || crypto.randomBytes(32).toString('hex'),
  yookassaShopId: (process.env.YOOKASSA_SHOP_ID || '').trim(),
  yookassaSecretKey: (process.env.YOOKASSA_SECRET_KEY || '').trim(),
  databasePath: path.resolve(process.cwd(), process.env.DATABASE_PATH || './yasna.db'),
  uploadsDir: path.resolve(process.cwd(), 'uploads'),
  isProduction: process.env.NODE_ENV === 'production',
};
