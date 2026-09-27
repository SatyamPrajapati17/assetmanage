const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const env = require('./config/env');
const { errorHandler } = require('./middleware/errorHandler');
const routes = require('./routes');

function createApp() {
  const app = express();

  // CLIENT_ORIGIN: comma-separated allow-list, or '*' to reflect any origin
  // (public demo API — auth is via Bearer tokens, not cookies).
  const allowedOrigins = String(env.clientOrigin || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin:
        allowedOrigins.includes('*') || allowedOrigins.length === 0
          ? true
          : (origin, cb) => cb(null, !origin || allowedOrigins.includes(origin)),
      credentials: true,
    })
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  if (env.nodeEnv !== 'test') app.use(morgan('dev'));

  // Local disk storage for photos/documents (TRD §1 — swap for S3 in prod).
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

  app.get('/health', (_req, res) => res.json({ success: true, data: { status: 'ok' } }));

  app.use('/api/v1', routes);
  // Fallback mount: some hosting/rewrite setups strip the /api/v1 prefix before
  // the request reaches us — this keeps both shapes working.
  app.use('/', routes);

  // 404 for unknown API routes
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'ROUTE_NOT_FOUND', message: `No route for ${req.method} ${req.originalUrl}` },
    });
  });

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
