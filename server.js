'use strict';

require('dotenv').config();

const express = require('express');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Configuration ────────────────────────────────────────────────────────────
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const FB_PAGE_ID = process.env.FB_PAGE_ID || '';
const FB_PAGE_ACCESS_TOKEN = process.env.FB_PAGE_ACCESS_TOKEN || '';
const MAX_IMAGES = parseInt(process.env.MAX_IMAGES || '5', 10);
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];

const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'post_log.csv');
const LOG_HEADER = 'timestamp_iso,username,image_count,consent_checked,status,facebook_post_id,error_message\n';

// ── Multer setup (memory storage – no permanent disk writes) ─────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE_BYTES, files: MAX_IMAGES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// ── CSV logging ───────────────────────────────────────────────────────────────
function escapeCsv(value) {
  const str = String(value == null ? '' : value);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function appendLog({ username, imageCount, consentChecked, status, facebookPostId, errorMessage }) {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    const needsHeader = !fs.existsSync(LOG_FILE);
    const row = [
      new Date().toISOString(),
      username,
      imageCount,
      consentChecked,
      status,
      facebookPostId || '',
      errorMessage || '',
    ].map(escapeCsv).join(',') + '\n';

    fs.appendFileSync(LOG_FILE, needsHeader ? LOG_HEADER + row : row, 'utf8');
  } catch (err) {
    console.error('Logging error:', err.message);
  }
}

// ── Facebook helpers ──────────────────────────────────────────────────────────
async function uploadUnpublishedPhoto(fileBuffer, mimeType) {
  const form = new FormData();
  form.append('source', fileBuffer, { contentType: mimeType, filename: 'photo.jpg' });
  form.append('published', 'false');
  form.append('access_token', FB_PAGE_ACCESS_TOKEN);

  const response = await axios.post(
    `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/photos`,
    form,
    { headers: form.getHeaders() }
  );
  return response.data.id;
}

async function createFeedPost(caption, mediaIds) {
  const attachedMedia = mediaIds.map((id) => ({ media_fbid: id }));
  const response = await axios.post(
    `https://graph.facebook.com/v19.0/${FB_PAGE_ID}/feed`,
    {
      message: caption,
      attached_media: attachedMedia,
      access_token: FB_PAGE_ACCESS_TOKEN,
    }
  );
  return response.data.id;
}

// ── Rate limiting ─────────────────────────────────────────────────────────────
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Too many requests. Please wait a few minutes and try again.' },
});

// ── Static files ──────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', generalLimiter, (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/health', generalLimiter, (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/post', postLimiter, upload.array('photos', MAX_IMAGES), async (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const caption = String(req.body.caption || '').trim();
  const consent = String(req.body.consent || '');
  const files = Array.isArray(req.files) ? req.files : [];

  // ── Authentication ────────────────────────────────────────────────────────
  if (!APP_PASSWORD) {
    return res.status(500).json({ ok: false, message: 'Server misconfiguration: APP_PASSWORD not set.' });
  }
  if (password !== APP_PASSWORD) {
    return res.status(401).json({ ok: false, message: 'Incorrect password. Please try again.' });
  }

  // ── Validation ────────────────────────────────────────────────────────────
  if (consent !== 'true') {
    return res.status(400).json({ ok: false, message: 'You must confirm consent and safeguarding checks before posting.' });
  }

  if (files.length === 0) {
    return res.status(400).json({ ok: false, message: 'Please select at least one photo.' });
  }

  if (files.length > MAX_IMAGES) {
    return res.status(400).json({ ok: false, message: `You can upload a maximum of ${MAX_IMAGES} photos at once.` });
  }

  if (!FB_PAGE_ID || !FB_PAGE_ACCESS_TOKEN) {
    appendLog({ username, imageCount: files.length, consentChecked: true, status: 'failure', errorMessage: 'Facebook credentials not configured' });
    return res.status(500).json({ ok: false, message: 'Server misconfiguration: Facebook credentials not set.' });
  }

  // ── Facebook posting ──────────────────────────────────────────────────────
  try {
    const mediaIds = [];
    for (const file of files) {
      const id = await uploadUnpublishedPhoto(file.buffer, file.mimetype);
      mediaIds.push(id);
    }

    const postId = await createFeedPost(caption, mediaIds);

    appendLog({ username, imageCount: files.length, consentChecked: true, status: 'success', facebookPostId: postId });

    return res.json({ ok: true, message: 'Posted to Facebook successfully!', postId });
  } catch (err) {
    const errorMessage = err.response?.data?.error?.message || err.message || 'Unknown error';
    appendLog({ username, imageCount: files.length, consentChecked: true, status: 'failure', errorMessage });
    return res.status(502).json({ ok: false, message: `Failed to post to Facebook. ${errorMessage}` });
  }
});

// ── Multer error handler ──────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ ok: false, message: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ ok: false, message: 'Internal server error.' });
});

// ── Start server ──────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`photoPoster server running on http://localhost:${PORT}`);
});

module.exports = app;
