import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import http from 'node:http';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { config } from './src/server/config.ts';
import { getDb, HttpError } from './src/server/db.ts';
import { masterRouter } from './src/server/routes/masterRoutes.ts';
import { parentRouter } from './src/server/routes/parentRoutes.ts';
import { publicRouter } from './src/server/routes/publicRoutes.ts';
import { webhookRouter } from './src/server/routes/webhookRoutes.ts';
import { seedInitialDataIfEmpty } from './src/server/seed.ts';
import { resolveFamilyByToken } from './src/server/security.ts';
import {
  getVapidPublicKey,
  savePushSubscription,
  startReminderScheduler,
} from './src/server/services/pushService.ts';

async function bootstrap(): Promise<void> {
  getDb();
  seedInitialDataIfEmpty();

  const app = express();
  const httpServer = http.createServer(app);
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    const forwardedProto = req.headers['x-forwarded-proto']?.toString().split(',')[0]?.trim();
    if (req.secure || forwardedProto === 'https') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    next();
  });

  app.get('/api/push/vapid-public-key', (_req, res) => {
    try {
      const publicKey = getVapidPublicKey();
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.json({ publicKey });
    } catch (err) {
      console.error('[Ясна Push] Ошибка выдачи VAPID-ключа:', err);
      res.status(500).json({ error: 'Не удалось получить публичный VAPID-ключ' });
    }
  });

  app.post('/api/push/subscribe', (req, res, next) => {
    try {
      const rawToken = String(req.body?.token ?? req.headers['x-family-token'] ?? '').trim();
      const family = resolveFamilyByToken(rawToken);
      const result = savePushSubscription(family.id, {
        endpoint: String(req.body?.endpoint ?? ''),
        keys: {
          p256dh: String(req.body?.keys?.p256dh ?? ''),
          auth: String(req.body?.keys?.auth ?? ''),
        },
      });
      res.status(201).json({ ok: true, count: result.count });
    } catch (err) {
      next(err);
    }
  });

  app.use('/api/public', publicRouter);
  app.use('/api/lk', parentRouter);
  app.use('/api/master', masterRouter);
  app.use('/api', webhookRouter);

  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API-маршрут не найден' });
  });

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.statusCode).json({ error: err.message });
      return;
    }
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          error: 'Размер загружаемого файла превышает допустимый лимит (до 5 МБ для чеков, до 8 МБ для документов)',
        });
        return;
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_FIELD_COUNT') {
        res.status(400).json({
          error: 'Превышено допустимое количество файлов или полей в запросе',
        });
        return;
      }
      res.status(400).json({ error: `Ошибка загрузки файла: ${err.message}` });
      return;
    }
    console.error('[Server Error]', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  if (!config.isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.yookassa.ru; object-src 'none'; base-uri 'self'; form-action 'self'"
      );
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(config.port, '0.0.0.0', () => {
    console.log(`[Ясна] Сервер запущен на http://0.0.0.0:${config.port}`);
    startReminderScheduler();
  });
}

bootstrap().catch((err) => {
  console.error('[Ясна] Ошибка запуска сервера:', err);
  process.exit(1);
});
