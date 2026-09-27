/**
 * Application error hierarchy — converted to the standard envelope by errorHandler.
 * 400 validation · 401 auth · 403 role · 404 not found · 409 conflict · 500 fallback
 */
class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details) {
    super(400, 'VALIDATION_ERROR', message, details);
  }
}

class AuthError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'UNAUTHENTICATED', message);
  }
}

class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(403, 'FORBIDDEN', message);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(404, 'NOT_FOUND', message);
  }
}

class ConflictError extends AppError {
  constructor(code, message, details) {
    super(409, code, message, details);
  }
}

/** Normalizes Mongoose duplicate-key errors into a 409/400 AppError. */
function fromMongoError(err) {
  if (err && err.code === 11000) {
    const fields = Object.keys(err.keyPattern || {}).join(', ');
    return new ConflictError('DUPLICATE_KEY', `A record with the same ${fields} already exists`);
  }
  return err;
}

module.exports = {
  AppError,
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  fromMongoError,
};
