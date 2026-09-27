const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { AuthError } = require('../utils/errors');

/** Verifies the Bearer access token and attaches req.user ({ id, role, department }). */
function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new AuthError('Access token missing'));
  try {
    const payload = jwt.verify(token, env.jwtAccessSecret);
    req.user = {
      id: payload.sub,
      role: payload.role,
      department: payload.department || null,
    };
    return next();
  } catch {
    return next(new AuthError('Session expired or invalid — please log in again'));
  }
}

module.exports = { authenticate };
