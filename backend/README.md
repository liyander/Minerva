# Incognitrix Backend (MySQL)

This backend provides API support for:
- Authentication
- Experimental rooms
- Career paths (including modules/resources)
- Platform configuration
- Public API access for external applications

## 1. Configure environment

Copy `.env.example` to `.env` and keep your requested credentials:

- `DB_USER=CTF`
- `DB_PASSWORD=root`

Also set:
- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `JWT_SECRET`
- `PUBLIC_API_KEY` or `PUBLIC_API_KEYS`
- `NVIDIA_API_KEY`

Optional AI overrides:
- `AI_BASE_URL` (default: `https://integrate.api.nvidia.com/v1`)
- `AI_MODEL` (default: `moonshotai/kimi-k2-thinking`)
- `AI_TEMPERATURE` (default: `1`)
- `AI_TOP_P` (default: `0.9`)
- `AI_MAX_TOKENS` (default: `16384`)

## 2. Initialize database and seed defaults

```bash
npm run db:init
```

This creates schema + seeds default values already present in your app:
- users (`operator01`, `admin01`)
- rooms
- career paths
- platform config

## 3. Start backend

```bash
npm run dev
```

Backend runs on `http://localhost:4000` by default.

## API Summary

- `POST /api/auth/login`
- `GET /api/auth/me`
- `GET /api/rooms`
- `GET /api/rooms/:id`
- `POST /api/rooms` (admin)
- `PUT /api/rooms/:id` (admin)
- `DELETE /api/rooms/:id` (admin)
- `GET /api/career-paths`
- `GET /api/career-paths/:id`
- `POST /api/career-paths` (admin)
- `PUT /api/career-paths/:id` (admin)
- `DELETE /api/career-paths/:id` (admin)
- `GET /api/platform-config`
- `PUT /api/platform-config` (admin)
- `GET /api/public/health`
- `GET /api/public/meta` (requires API key)
- `GET /api/public/summary` (requires API key)
- `GET /api/public/students` (requires API key)
- `GET /api/public/students/levels` (requires API key)
- `GET /api/public/students/levels/:level` (requires API key)
- `GET /api/public/students/:id` (requires API key)
- `GET /api/public/students/:id/progress` (requires API key)
- `GET /api/public/students/:id/certificates` (requires API key)
- `GET /api/public/study-paths` (requires API key)
- `GET /api/public/study-paths/:id` (requires API key)
- `GET /api/public/rooms` (requires API key)
- `GET /api/public/rooms/:id` (requires API key)
- `GET /api/public/certificates` (requires API key)
- `GET /api/public/certificates/:certificateId` (requires API key)
- `GET /api/public/statistics/categories` (requires API key)
- `GET /api/public/statistics/completion` (requires API key)
- `GET /api/public/stats` (requires API key)

All non-login endpoints require `Authorization: Bearer <token>`.

Public API requests must include either `x-api-key: <key>` or `Authorization: Bearer <key>`.

See [docs/public-api.md](docs/public-api.md) for request/response examples.
