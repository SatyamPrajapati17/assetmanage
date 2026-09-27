/**
 * Vercel serverless entry point.
 * Wraps the Express app: connects to MongoDB once per Lambda instance (cold
 * start), then reuses the connection and app across warm invocations.
 */
const { createApp } = require('../src/app');

let readyPromise = null;
let app = null;

async function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      const { connectDB } = require('../src/config/db');
      const { startJobs } = require('../src/jobs');
      await connectDB();
      // cron cadence is meaningless on serverless, but the boot catch-up
      // (overdue scan + booking sync) is useful and runs once per cold start.
      try {
        startJobs();
      } catch (err) {
        console.error('[jobs] init failed (non-fatal):', err.message);
      }
    })().catch((err) => {
      readyPromise = null; // allow a fresh attempt on the next invocation
      throw err;
    });
  }
  return readyPromise;
}

module.exports = async (req, res) => {
  try {
    await ensureReady();
    if (!app) app = createApp();
    return app(req, res);
  } catch (err) {
    console.error('serverless handler error:', err.message);
    if (!res.headersSent) {
      res.status(503).json({
        success: false,
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Service is starting up or database unavailable' },
      });
    }
  }
};
