const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const env = require('../config/env');
const User = require('../models/User');
const Department = require('../models/Department');
const { validate, objectId, z } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { ok, asyncHandler } = require('../middleware/errorHandler');
const { AuthError, ValidationError, NotFoundError } = require('../utils/errors');
const { logActivity } = require('../utils/activity');

const router = express.Router();

const SIGNUP_SCHEMA = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  department: objectId.optional().nullable(),
});

const LOGIN_SCHEMA = z.object({ email: z.string().email(), password: z.string().min(1) });

function signAccess(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role, department: user.department || null },
    env.jwtAccessSecret,
    { expiresIn: env.jwtAccessExpires }
  );
}

function signRefresh(user) {
  return jwt.sign({ sub: String(user._id), type: 'refresh' }, env.jwtRefreshSecret, {
    expiresIn: env.jwtRefreshExpires,
  });
}

/** POST /auth/signup — always creates an Employee (server strips any role field — TRD §5). */
router.post(
  '/signup',
  validate(SIGNUP_SCHEMA),
  asyncHandler(async (req, res) => {
    const { name, email, password, department } = req.body;

    if (department) {
      const dept = await Department.findById(department);
      if (!dept) throw new ValidationError('Selected department does not exist');
    }

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) throw new ValidationError('An account with this email already exists');

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      name,
      email,
      passwordHash,
      role: 'employee', // hardcoded — body role ignored/never read
      department: department || null,
    });

    logActivity({
      actor: user._id,
      action: 'USER_SIGNED_UP',
      entity: { kind: 'User', id: user._id },
      metadata: { email: user.email },
    });

    return ok(
      res,
      {
        user: user.toJSON(),
        accessToken: signAccess(user),
        refreshToken: signRefresh(user),
      },
      'Account created — role: Employee',
      201
    );
  })
);

/** POST /auth/login */
router.post(
  '/login',
  validate(LOGIN_SCHEMA),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) throw new AuthError('Invalid email or password');
    if (user.status !== 'Active') throw new AuthError('This account is inactive — contact an admin');

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) throw new AuthError('Invalid email or password');

    return ok(res, {
      user: user.toJSON(),
      accessToken: signAccess(user),
      refreshToken: signRefresh(user),
    });
  })
);

/** POST /auth/refresh — rotates access token from a valid refresh token. */
router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const { refreshToken } = req.body || {};
    if (!refreshToken) throw new AuthError('refreshToken required');
    let payload;
    try {
      payload = jwt.verify(refreshToken, env.jwtRefreshSecret);
    } catch {
      throw new AuthError('Refresh token expired or invalid');
    }
    if (payload.type !== 'refresh') throw new AuthError('Invalid token type');
    const user = await User.findById(payload.sub);
    if (!user || user.status !== 'Active') throw new AuthError('Account unavailable');
    return ok(res, { accessToken: signAccess(user), refreshToken: signRefresh(user) });
  })
);

/** GET /auth/me */
router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.id).populate('department', 'name');
    if (!user) throw new NotFoundError('User not found');
    return ok(res, { user });
  })
);

/**
 * POST /auth/forgot-password — demo flow: reset link is NOT emailed; it is
 * logged to the server console and returned in the API response (documented
 * in the Implementation Plan).
 */
router.post(
  '/forgot-password',
  validate(z.object({ email: z.string().email() })),
  asyncHandler(async (req, res) => {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    // Always respond the same way to avoid account enumeration.
    const generic = { message: 'If that email exists, a reset link has been generated (demo: see server console).' };
    if (!user) return ok(res, generic);

    const raw = crypto.randomBytes(24).toString('hex');
    user.passwordResetTokenHash = crypto.createHash('sha256').update(raw).digest('hex');
    user.passwordResetExpires = new Date(Date.now() + 30 * 60 * 1000);
    await user.save();

    const resetLink = `http://localhost:5173/reset-password?token=${raw}`;
    console.log('\n==========================================================');
    console.log('[demo] Password reset link (email delivery simulated):');
    console.log(resetLink);
    console.log('==========================================================\n');

    return ok(res, { ...generic, resetLink, message: 'Reset link generated (demo mode — link returned here instead of email).' });
  })
);

/** POST /auth/reset-password */
router.post(
  '/reset-password',
  validate(z.object({ token: z.string().min(10), password: z.string().min(6) })),
  asyncHandler(async (req, res) => {
    const { token, password } = req.body;
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetTokenHash: hash,
      passwordResetExpires: { $gt: new Date() },
    });
    if (!user) throw new ValidationError('Reset link is invalid or expired');

    user.passwordHash = await bcrypt.hash(password, 10);
    user.passwordResetTokenHash = null;
    user.passwordResetExpires = null;
    await user.save();

    logActivity({ actor: user._id, action: 'PASSWORD_RESET', entity: { kind: 'User', id: user._id } });
    return ok(res, { message: 'Password updated — you can log in now' });
  })
);

module.exports = router;
