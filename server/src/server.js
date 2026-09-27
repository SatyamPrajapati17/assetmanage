const { connectDB } = require('./config/db');
const { createApp } = require('./app');
const env = require('./config/env');
const { startJobs } = require('./jobs');

async function main() {
  await connectDB();
  startJobs();
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[server] AssetFlow API listening on http://localhost:${env.port}`);
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err.message);
  process.exit(1);
});
