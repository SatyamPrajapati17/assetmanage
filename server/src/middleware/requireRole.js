const { ForbiddenError, AuthError } = require('../utils/errors');

const ROLE_ALIASES = {
  admin: ['admin'],
  assetManager: ['admin', 'assetManager'],
  departmentHead: ['admin', 'assetManager', 'departmentHead'],
  employee: ['admin', 'assetManager', 'departmentHead', 'employee'],
};

/** Route guard: requireRole('admin') or requireRole(['admin','assetManager']). */
function requireRole(roles) {
  const allowed = typeof roles === 'string' ? ROLE_ALIASES[roles] : roles;
  if (!allowed) throw new Error(`requireRole: unknown role spec "${roles}"`);
  return (req, _res, next) => {
    if (!req.user) return next(new AuthError('Authentication required'));
    if (!allowed.includes(req.user.role)) {
      return next(new ForbiddenError(`Requires one of: ${allowed.join(', ')}`));
    }
    return next();
  };
}

/**
 * Department scoping helper for Department Heads: returns the department id the
 * request may operate on. Admin/Asset Manager are unscoped (pass through their
 * requested value); Department Head is pinned to their own department.
 */
function departmentScope(req) {
  if (['admin', 'assetManager'].includes(req.user.role)) return req.query.department || null;
  return req.user.department || null;
}

module.exports = { requireRole, departmentScope };
