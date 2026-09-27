require('dotenv').config();

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing required env var: ${name}`);
  return v;
}

const env = {
  port: Number(process.env.PORT || 5000),
  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/assetflow'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET', 'change_me'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'change_me_too'),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || '45m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV || 'development',
};

module.exports = env;
