const { z } = require('zod');
const { ValidationError } = require('../utils/errors');

/**
 * validate(schema, source) — middleware factory. Validates req[source] (default 'body')
 * against a zod schema; parsed value is assigned back to req[source].
 */
const validate = (schema, source = 'body') => (req, _res, next) => {
  const toParse =
    source === 'query'
      ? // Express 5 makes req.query a getter; Express 4 exposes a plain object.
        // Normalize to a plain object either way so zod can process it.
        { ...req.query }
      : req[source];
  const result = schema.safeParse(toParse);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message,
    }));
    return next(
      new ValidationError(
        `Invalid ${source}: ${details.map((d) => `${d.path || '(root)'} ${d.message}`).join('; ')}`,
        details
      )
    );
  }
  if (source === 'query') {
    Object.keys(req.query).forEach((k) => delete req.query[k]);
    Object.assign(req.query, result.data);
  } else {
    req[source] = result.data;
  }
  next();
};

/** Shared ObjectId validator. */
const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'must be a 24-character hex id');

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
};

module.exports = { validate, objectId, pagination, z };
