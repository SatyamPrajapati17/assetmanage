const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { ok, asyncHandler } = require('../middleware/errorHandler');

const router = express.Router();

// Serverless platforms (Vercel/Lambda) ship a read-only app filesystem; /tmp is
// the only writable location and is ephemeral — fine for demo attachments.
const dir = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
try {
  fs.mkdirSync(dir, { recursive: true });
} catch {
  console.warn(`[uploads] could not create dir ${dir} (read-only FS?) — uploads will fail gracefully`);
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, dir),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safe}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

/** POST /uploads — single file upload, returns its serving URL. */
router.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No file uploaded' } });
    }
    return ok(res, { url: `/uploads/${req.file.filename}` }, 'File uploaded', 201);
  })
);

module.exports = router;
