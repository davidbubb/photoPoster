# photoPoster – Phase 1.5

A minimal Node.js / Express web app that lets school staff upload photos and a caption from iPads and post them directly to the school Facebook Page via the Meta Graph API — with no permanent image storage.

---

## Features

- Single-page, touch-friendly upload form (iPad-optimised)
- Multi-photo upload (JPEG, PNG, HEIC/HEIF)
- Required consent / safeguarding acknowledgement checkbox
- Shared app-password authentication (no user accounts needed)
- Posts to Facebook Page via Graph API relay; images never stored
- CSV activity log (`logs/post_log.csv`)
- `/health` endpoint for uptime monitoring

---

## Requirements

- **Node.js 18+** (LTS recommended)
- A **Meta (Facebook) Developer App** with a long-lived **Page Access Token**
  - Permissions needed: `pages_manage_posts`, `pages_read_engagement`

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/davidbubb/photoPoster.git
cd photoPoster
npm install
```

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|---|---|
| `PORT` | Port the server listens on (default `3000`) |
| `APP_PASSWORD` | Shared password staff enter in the form |
| `FB_PAGE_ID` | Facebook Page ID (numeric) |
| `FB_PAGE_ACCESS_TOKEN` | Long-lived Page Access Token from Meta |
| `MAX_IMAGES` | Max photos per post (default `5`) |
| `MAX_FILE_SIZE_MB` | Max size per image in MB (default `10`) |

### 3. Run

```bash
npm start
```

Navigate to `http://localhost:3000` (or your server's address) in a browser.

For development with auto-restart on file changes (Node 18+):

```bash
npm run dev
```

---

## Facebook Setup

1. Create a Meta Developer App at [developers.facebook.com](https://developers.facebook.com).
2. Add the **Facebook Login for Business** or **Pages API** product.
3. Generate a **long-lived Page Access Token** for your school's Facebook Page.
4. Grant the token the permissions `pages_manage_posts` and `pages_read_engagement`.
5. Set `FB_PAGE_ID` and `FB_PAGE_ACCESS_TOKEN` in your `.env`.

> **Token expiry:** Long-lived tokens last ~60 days. Set a calendar reminder to renew the token. A server-level token rotation script or Meta System User token is recommended for production.

---

## Usage

1. Open the app URL in a browser on any device (iPad, PC, phone).
2. Enter your name and the shared app password.
3. Select up to 5 photos (JPEG / PNG / HEIC, max 10 MB each).
4. Type a caption.
5. Tick the consent checkbox.
6. Click **Post to Facebook**.

A success or failure message appears immediately. Activity is logged to `logs/post_log.csv`.

---

## Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Serves the upload form |
| `POST` | `/post` | Accepts multipart upload; posts to Facebook |
| `GET` | `/health` | Returns `{ status: "ok", timestamp }` |

---

## Security notes

- **Never commit `.env`** – it is listed in `.gitignore`.
- The Facebook Page Access Token is **never sent to the browser**; it lives only in server-side environment variables.
- The shared `APP_PASSWORD` should be changed from the default and shared only with authorised staff.
- All file-type and size validation is enforced server-side (not just client-side).
- No images are stored permanently; all file buffers are held in memory only during the upload request and discarded immediately after posting.
- Run the app behind HTTPS in production (e.g., behind an nginx reverse proxy with Let's Encrypt, or on a platform that provides HTTPS automatically such as Railway, Render, or Azure App Service).
- Restrict network access to school staff only (VPN, IP allowlist, or internal network) for additional security.

---

## Logs

Activity is appended to `logs/post_log.csv` with the following fields:

| Field | Description |
|---|---|
| `timestamp_iso` | ISO 8601 timestamp |
| `username` | Name entered by staff member |
| `image_count` | Number of images in the post |
| `consent_checked` | Whether the consent box was ticked |
| `status` | `success` or `failure` |
| `facebook_post_id` | Facebook post ID (on success) |
| `error_message` | Error detail (on failure) |

The `logs/` directory is excluded from version control by `.gitignore`.

---

## Project structure

```
photoPoster/
├── public/
│   └── index.html       # Single-page upload form
├── logs/                # CSV logs (auto-created, git-ignored)
├── server.js            # Express app
├── package.json
├── .env.example         # Environment variable template
├── .gitignore
└── README.md
```

---

## Licence

MIT
