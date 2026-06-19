# Creator Cards API

A microservice REST API that lets creators publish shareable profile cards with links and service rates.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/creator-cards` | Create a new creator card |
| GET | `/creator-cards/:slug` | Retrieve a card by slug |
| DELETE | `/creator-cards/:slug` | Delete a card by slug |

## Quick Start

```bash
npm install
cp .env.example .env   # fill in MONGODB_URI and PORT
node app.js
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default 8811) |
| `MONGODB_URI` | MongoDB connection string |
| `PINO_LOG_LEVEL` | Log level (info, silent, etc.) |

## Running Tests

```bash
npm test
```

## Business Rules

- **Slug**: auto-generated from title if omitted; must be unique across all cards
- **Private cards**: require `access_code` (6 alphanumeric chars) on create; callers supply it as `?access_code=` on GET
- **Draft cards**: never returned by the public GET endpoint (NF02)
- **Deleted cards**: soft-deleted; GET returns NF01 after deletion
- **`id` vs `_id`**: MongoDB stores `_id` internally; all API responses expose it as `id`

## Custom Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| SL02 | 400 | Slug already taken |
| AC01 | 400 | access_code required for private cards |
| AC05 | 400 | access_code not allowed on public cards |
| NF01 | 404 | Card not found (or deleted) |
| NF02 | 404 | Card exists but is a draft |
| AC03 | 403 | Private card — access_code required |
| AC04 | 403 | Invalid access_code |

## Architecture

Built on the R17 node template following its layered architecture:

```
Request → Endpoint → Service → MongoDB (Mongoose)
```

- `endpoints/creator-cards/` — HTTP routing
- `services/creator-cards/` — business logic & validation
- `models/creator-card.js` — Mongoose schema
- `messages/creator-card.js` — error message constants
- `specs/creator-cards/` — test suite (22 tests, all passing)
