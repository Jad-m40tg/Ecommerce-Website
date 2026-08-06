// routes/upload.js — Image upload (admin only).
// Accepts a single image file, validates it's a real image using magic bytes,
// saves it to the uploads/ folder with a unique filename, and returns the URL.

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(authenticateToken, requireAdmin);

// Configure where and how files are saved
const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  // Generate a unique filename: timestamp-randomstring.ext (prevents name collisions)
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});

// File filter: only accept image files based on extension and MIME type
const fileFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png|gif|webp/;
  const ext = allowed.test(path.extname(file.originalname).toLowerCase());
  const mime = allowed.test(file.mimetype);
  if (ext && mime) return cb(null, true);
  cb(new Error('Only image files (jpeg, png, gif, webp) are allowed'));
};

// Max file size: 5MB
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// Magic bytes: the actual first bytes of each image format.
// This catches fake files that have the right extension but wrong content
// (e.g. a .exe renamed to .jpg).
const MAGIC_BYTES = {
  'ffd8ff': 'image/jpeg',    // JPEG files always start with FF D8 FF
  '89504e47': 'image/png',   // PNG files always start with 89 50 4E 47
  '47494638': 'image/gif',   // GIF files always start with 47 49 46 38
  '52494646': 'image/webp'   // WebP files always start with 52 49 46 46
};

// Reads the first 12 bytes of a file and checks if they match known image headers
function validateMagicBytes(filePath) {
  const buffer = Buffer.alloc(12);
  const fd = fs.openSync(filePath, 'r');
  fs.readSync(fd, buffer, 0, 12, 0);
  fs.closeSync(fd);
  const header = buffer.toString('hex');
  for (const magic of Object.keys(MAGIC_BYTES)) {
    if (header.startsWith(magic)) return true;
  }
  return false;
}

// POST /api/upload — Admin only. Upload a single image file (field: "image").
router.post('/', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  // Second layer of validation: check the actual file content
  if (!validateMagicBytes(req.file.path)) {
    fs.unlinkSync(req.file.path); // delete the fake file
    return res.status(400).json({ error: 'File is not a valid image' });
  }

  // Return the public URL path to the uploaded image
  res.json({ url: `/uploads/${req.file.filename}` });
});

module.exports = router;
