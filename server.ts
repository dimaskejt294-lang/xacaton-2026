import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { config } from './src/server/config.ts';
import { getDb, HttpError } from './src/server/db.ts';
import { masterRouter } from './src/server/routes/masterRoutes.ts';
import { parentRouter } from './src/server/routes/parentRoutes.ts';
import { publicRouter } from './src/server/routes/publicRoutes.ts';
import { webhookRouter } from './src/server/routes/webhookRoutes.ts';
import { seedInitialDataIfEmpty } from './src/server/seed.ts';

async function bootstrap(): Promise<void> {
  getDb();
  seedInitialDataIfEmpty();

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    next();
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
        res.status(400).json({ error: 'Размер файла чека не должен превышать 5 МБ' });
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
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[Ясна] Сервер запущен на http://0.0.0.0:${config.port}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Ясна] Ошибка запуска сервера:', err);
  process.exit(1);
});
