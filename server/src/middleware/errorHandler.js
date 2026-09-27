const mongoose = require('mongoose');
const { AppError, fromMongoError } = require('../utils/errors');

/** Success envelope helper. */
function ok(res, data, message = '', status = 200) {
  return res.status(status).json({ success: true, data, message });
}

/** Central error handler — converts AppError/Mongo errors into the standard envelope. */
function errorHandler(err, _req, res, _next) {
  let error = err;
  if (error instanceof mongoose.Error.ValidationError) {
    error = new AppError(
      400,
      'MONGO_VALIDATION',
      Object.values(error.errors)
        .map((e) => e.message)
        .join('; ')
    );
  } else if (error instanceof mongoose.Error.CastError) {
    error = new AppError(400, 'INVALID_ID', `Invalid id "${error.value}"`);
  } else if (!(error instanceof AppError)) {
    error = fromMongoError(error);
  }

  const status = error.status || 500;
  if (status >= 500) {
    console.error('[error]', err);
  }

  if (res.headersSent) {
    return;
  }

  res.status(status).json({
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'Something went wrong',
      ...(error.details ? { details: error.details } : {}),
    },
  });
}

/** Wraps async route handlers so thrown errors reach errorHandler. */
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ok, errorHandler, asyncHandler };
