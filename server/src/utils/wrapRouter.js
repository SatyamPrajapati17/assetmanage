/**
 * Express 4 does not route rejected promises from async handlers to the error
 * middleware — an unhandled rejection kills the whole process (observed live:
 * the 409 BOOKING_OVERLAP path crashed the server). Rather than wrapping every
 * registration individually, we walk each sub-router's stack once at mount
 * time (routes/index.js) and wrap any async (req, res, next) handler so its
 * rejections become next(err).
 *
 * Error handlers (4 args) and synchronous middleware are left untouched.
 */
function asyncSafe(fn) {
  if (typeof fn !== 'function' || fn.length >= 4) return fn;
  const wrapped = (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  Object.defineProperties(wrapped, {
    length: { value: fn.length },
    name: { value: fn.name },
  });
  for (const key of Object.keys(fn)) wrapped[key] = fn[key];
  return wrapped;
}

function wrapLayer(layer) {
  if (!layer) return;
  if (layer.route && Array.isArray(layer.route.stack)) {
    // Route layer: the real handlers live on layer.route.stack.
    layer.route.stack.forEach((l) => {
      l.handle = asyncSafe(l.handle);
    });
  } else if (layer.name === 'router' && layer.handle && Array.isArray(layer.handle.stack)) {
    layer.handle.stack.forEach(wrapLayer); // nested sub-router
  } else if (typeof layer.handle === 'function') {
    layer.handle = asyncSafe(layer.handle);
  }
}

function wrapRouter(router) {
  if (router && Array.isArray(router.stack)) router.stack.forEach(wrapLayer);
  return router;
}

module.exports = wrapRouter;
