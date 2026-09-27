const express = require('express');
const mongoose = require('mongoose');
const Asset = require('../models/Asset');
const AssetCategory = require('../models/AssetCategory');
const Counter = require('../models/Counter');
const { validate, objectId, z } = require('../middleware/validate');
const { authenticate } = require('../middleware/auth');
const { requireRole } = require('../middleware/requireRole');
const { ok, asyncHandler } = require('../middleware/errorHandler');
const { NotFoundError, ValidationError } = require('../utils/errors');
const { logActivity } = require('../utils/activity');
const { resolveAssetParam } = require('../utils/helpers');
const allocationService = require('../services/allocationService');
const maintenanceController = require('../controllers/maintenance.controller');

const router = express.Router();

// All asset routes require auth (view) — registration is Asset Manager/Admin.
router.use(authenticate);

const ASSET_SCHEMA = z.object({
  name: z.string().min(2),
  category: objectId,
  serialNumber: z.string().optional().nullable(),
  acquisitionDate: z.string().optional().nullable(),
  acquisitionCost: z.coerce.number().min(0).optional().nullable(),
  condition: z.enum(['New', 'Good', 'Fair', 'Poor', 'Damaged']).default('New'),
  location: z.string().optional().nullable(),
  department: objectId.optional().nullable(),
  isBookable: z
    .preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.coerce.boolean())
    .default(false),
  customFieldValues: z.preprocess((v) => {
    if (typeof v === 'string') {
      try { return JSON.parse(v); } catch { return {}; }
    }
    return v;
  }, z.record(z.string(), z.any())).optional(),
  photos: z.array(z.string()).optional(),
  documents: z.array(z.string()).optional(),
});

/** Generates the next sequential asset tag: AF-0001 (Backend Schema §12). */
async function nextAssetTag() {
  const seq = await Counter.nextSeq('assetTag');
  return `AF-${String(seq).padStart(4, '0')}`;
}

/** Generates a QR code (data URL) encoding the asset tag. */
async function makeQr(assetTag) {
  const QRCode = require('qrcode');
  return QRCode.toDataURL(assetTag, { width: 220, margin: 1 });
}

/**
 * GET /assets — directory with search/filter/pagination (FR-4.2).
 * Query: q, status, category, department, location, isBookable, page, limit, sort.
 */
router.get(
  '/',
  validate(
    z.object({
      q: z.string().optional(),
      status: z.string().optional(),
      category: z.string().optional(),
      department: z.string().optional(),
      location: z.string().optional(),
      isBookable: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(20),
      sort: z.string().optional(),
    }),
    'query'
  ),
  asyncHandler(async (req, res) => {
    const { q, status, category, department, location, isBookable, page, limit, sort } = req.query;
    const filter = {};

    if (status) {
      const list = status.split(',').map((s) => s.trim()).filter(Boolean);
      filter.status = list.length > 1 ? { $in: list } : list[0];
    }
    if (category) filter.category = category;
    if (department) filter.department = department;
    if (location) filter.location = { $regex: location, $options: 'i' };
    if (isBookable === 'true') filter.isBookable = true;
    if (isBookable === 'false') filter.isBookable = false;
    if (q) {
      filter.$or = [
        { assetTag: { $regex: q, $options: 'i' } },
        { name: { $regex: q, $options: 'i' } },
        { serialNumber: { $regex: q, $options: 'i' } },
        { qrCode: { $regex: q, $options: 'i' } },
      ];
    }

    // Mongoose 8 sort() expects a single object (or array of [key, dir] pairs).
    const sortSpec = sort
      ? sort.split(',').reduce((acc, s) => {
          const key = s.startsWith('-') ? s.slice(1) : s;
          if (key) acc[key] = s.startsWith('-') ? -1 : 1;
          return acc;
        }, {})
      : { createdAt: -1 };

    const [items, total] = await Promise.all([
      Asset.find(filter)
        .sort(sortSpec)
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('category', 'name')
        .populate('department', 'name'),
      Asset.countDocuments(filter),
    ]);

    return ok(res, { items, total, page, pages: Math.ceil(total / limit) || 1 });
  })
);

/**
 * POST /assets — register asset (Asset Manager/Admin only, FR-4.1).
 * Uses multer upload middleware for photos/documents.
 */
router.post(
  '/',
  requireRole(['admin', 'assetManager']),
  uploadMiddleware(),
  validate(ASSET_SCHEMA),
  asyncHandler(async (req, res) => {
    const data = req.body;

    const category = await AssetCategory.findById(data.category);
    if (!category) throw new ValidationError('Selected category does not exist');

    if (data.serialNumber) {
      const dup = await Asset.findOne({ serialNumber: data.serialNumber });
      if (dup) throw new ValidationError(`Serial number already in use by ${dup.assetTag}`);
    }

    const assetTag = await nextAssetTag();
    const qrCode = await makeQr(assetTag);

    const asset = await Asset.create({
      ...data,
      serialNumber: data.serialNumber || undefined,
      assetTag,
      qrCode,
      acquisitionDate: data.acquisitionDate || null,
      acquisitionCost: data.acquisitionCost ?? null,
      location: data.location || null,
      department: data.department || null,
      photos: (req.files && req.files.photos ? req.files.photos : []).map((f) => `/uploads/${f.filename}`),
      documents: (req.files && req.files.documents ? req.files.documents : []).map((f) => `/uploads/${f.filename}`),
    });

    logActivity({
      actor: req.user.id,
      action: 'ASSET_REGISTERED',
      entity: { kind: 'Asset', id: asset._id },
      metadata: { assetTag: asset.assetTag, name: asset.name },
    });

    return ok(res, { asset }, `Asset ${asset.assetTag} registered`, 201);
  })
);

/** Multer disk-storage middleware for photos + documents fields. */
function uploadMiddleware() {
  const multer = require('multer');
  const path = require('path');
  const fs = require('fs');
  const dir = path.join(__dirname, '..', '..', 'uploads');
  fs.mkdirSync(dir, { recursive: true });
  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, dir),
    filename: (_req, file, cb) => {
      const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safe}`);
    },
  });
  const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
  return upload.fields([
    { name: 'photos', maxCount: 4 },
    { name: 'documents', maxCount: 4 },
  ]);
}

/** GET /assets/bookable — bookable resources for the Booking screen. */
router.get(
  '/bookable',
  asyncHandler(async (_req, res) => {
    const resources = await Asset.find({ isBookable: true })
      .populate('category', 'name')
      .sort({ name: 1 });
    return ok(res, { items: resources });
  })
);

/** GET /assets/:idOrTag — detail with holder + histories (FR-4.4). */
router.get(
  '/:idOrTag',
  asyncHandler(async (req, res) => {
    const asset = await resolveAssetParam(req.params.idOrTag);
    await asset
      .populate([
        { path: 'category', select: 'name customFields' },
        { path: 'department', select: 'name' },
      ]);

    const Allocation = mongoose.model('Allocation');
    const MaintenanceRequest = mongoose.model('MaintenanceRequest');
    const TransferRequest = mongoose.model('TransferRequest');
    const Booking = mongoose.model('Booking');

    const [holder, allocationHistory, maintenanceHistory, bookings] = await Promise.all([
      allocationService.currentHolderInfo(asset),
      Allocation.find({ asset: asset._id }).sort({ allocationDate: -1 })
        .populate('allocatedTo.employee', 'name email')
        .populate('allocatedTo.department', 'name')
        .populate('allocatedBy', 'name'),
      MaintenanceRequest.find({ asset: asset._id }).sort({ createdAt: -1 })
        .populate('raisedBy', 'name')
        .populate('technician', 'name'),
      Booking.find({ resource: asset._id }).sort({ start: -1 }).populate('bookedBy', 'name'),
    ]);

    return ok(res, {
      asset,
      holder,
      allocationHistory,
      maintenanceHistory,
      bookings,
    });
  })
);

/** PATCH /assets/:id — edit core fields (Asset Manager/Admin). */
router.patch(
  '/:id',
  requireRole(['admin', 'assetManager']),
  validate(ASSET_SCHEMA.partial()),
  asyncHandler(async (req, res) => {
    const asset = await Asset.findById(req.params.id);
    if (!asset) throw new NotFoundError('Asset not found');
    const update = { ...req.body };
    delete update.assetTag;
    delete update.qrCode;
    delete update.status; // status changes only via lifecycle endpoints
    Object.assign(asset, update);
    await asset.save();
    logActivity({ actor: req.user.id, action: 'ASSET_UPDATED', entity: { kind: 'Asset', id: asset._id } });
    return ok(res, { asset }, 'Asset updated');
  })
);

/**
 * PATCH /assets/:id/status — lifecycle transition (Asset Manager/Admin).
 * Validates against the allowed transition map (Backend Schema §4).
 */
router.patch(
  '/:id/status',
  requireRole(['admin', 'assetManager']),
  validate(z.object({ status: z.string(), note: z.string().optional() })),
  asyncHandler(async (req, res) => {
    const asset = await Asset.findById(req.params.id);
    if (!asset) throw new NotFoundError('Asset not found');
    const to = req.body.status;
    if (!Asset.canTransition(asset.status, to)) {
      throw new ValidationError(`Transition ${asset.status} → ${to} is not allowed`);
    }
    const from = asset.status;
    asset.status = to;
    if (to === 'Available') asset.currentAllocation = null;
    await asset.save();
    logActivity({
      actor: req.user.id,
      action: 'ASSET_STATUS_CHANGED',
      entity: { kind: 'Asset', id: asset._id },
      metadata: { from, to, note: req.body.note },
    });
    return ok(res, { asset }, `Status ${from} → ${to}`);
  })
);

/** POST /assets/:id/allocate — guarded by allocationService (TRD §4.1). */
router.post('/:id/allocate', asyncHandler(allocationService.allocate));

/** GET /assets/:id/allocation-history */
router.get('/:id/allocation-history', asyncHandler(allocationService.allocationHistory));

/** Maintenance sub-resource — request creation from Asset Detail (FR-7.1). */
router.post('/:id/maintenance', asyncHandler(maintenanceController.createForAsset));

module.exports = router;
