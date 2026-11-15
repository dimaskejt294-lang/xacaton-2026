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

function resolvePort(): number {
  const args = process.argv;
  const portFlagIdx = args.indexOf('--port');
  if (portFlagIdx !== -1 && args[portFlagIdx + 1]) {
    const cliPort = Number(args[portFlagIdx + 1]);
    if (Number.isFinite(cliPort) && cliPort > 0) {
      return cliPort;
    }
  }
  const envPort = Number(process.env.PORT ?? '3000');
  if (process.env.NODE_ENV === 'production' && Number.isFinite(envPort) && envPort > 0) {
    return envPort;
  }
  if (Number.isFinite(envPort) && envPort > 0 && envPort !== 8080) {
    return envPort;
  }
  return 3000;
}

export const config: AppConfig = {
  port: resolvePort(),
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
