# Incognitrix Public API

The public API is designed for external applications that need to read student, room, and study-path data from Incognitrix without using a user login session.

Developer-role users also have a separate Developer API under `/api/developer`. Developer keys are created from the Developer Panel and are intended for trusted internal scripts that need broader operational telemetry.

## Base URL

```text
http://localhost:4000/api/public
```

Adjust the host and port for your deployment.

## Authentication

All data endpoints require a public API key.

Send the key in one of these ways:

```http
x-api-key: your_public_api_key
```

```http
Authorization: Bearer your_public_api_key
```

`Authorization: ApiKey your_public_api_key` is also accepted.

Developer API keys use the same header formats, but call `/api/developer/data/:resource` instead of `/api/public/...`.

If the key is missing, the API returns `401 Unauthorized`.
If the key is not configured on the server, the API returns `503 Service Unavailable`.

## Quick Start

```bash
curl http://localhost:4000/api/public/summary \
  -H "x-api-key: your_public_api_key"
```

Developer API example:

```bash
curl http://localhost:4000/api/developer/data/all \
  -H "x-api-key: your_developer_api_key"
```

Developer data resources:
- `all`
- `users`
- `rooms`
- `progress`
- `docker`
- `career-paths`

## Endpoints

### Health and metadata

#### `GET /health`
Public health check. Does not require an API key.

Response:

```json
{
  "status": "ok",
  "service": "incognitrix-public-api",
  "version": "1.0.0"
}
```

#### `GET /meta`
Returns API name, version, and authentication format.

#### `GET /summary`
Returns the most useful overall dashboard data:
- total users
- total students
- active students studying
- completed students
- certificates issued
- study paths available
- rooms available
- student level distribution
- room and study-path summaries

### Student endpoints

#### `GET /students`
Returns a paginated list of students.

Query parameters:
- `limit` default `100`, max `500`
- `offset` default `0`
- `search` optional text filter

#### `GET /students/levels`
Returns the inferred study-level distribution.

#### `GET /students/levels/:level`
Returns all students for a level such as `Easy`, `Medium`, `Hard`, `Expert`, or `Unclassified`.

#### `GET /students/:id`
Returns a single student by numeric ID or username.

#### `GET /students/:id/progress`
Returns the selected student's room progress and certificates.

#### `GET /students/:id/certificates`
Returns only the selected student's certificates.

### Study path endpoints

#### `GET /study-paths`
Returns all study paths with counts for modules, rooms, studying students, and certificate holders.

#### `GET /study-paths/:id`
Returns one study path with its modules and resources.

### Room endpoints

#### `GET /rooms`
Returns all rooms with category, difficulty, and progress counts.

#### `GET /rooms/:id`
Returns one room with tags, required keywords, and progress counts.

### Certificate endpoints

#### `GET /certificates`
Returns all issued certificates with linked student and study-path details.

#### `GET /certificates/:certificateId`
Returns a single certificate record.

### Statistics endpoints

#### `GET /statistics/categories`
Returns room counts and student counts grouped by room category.

#### `GET /statistics/completion`
Returns overall completion totals for rooms and certificates.

#### `GET /stats`
Alias for `GET /summary`.

## Example responses

### Summary

```json
{
  "api": {
    "name": "Incognitrix Public Data API",
    "version": "1.0.0",
    "keyAuth": {
      "configured": true,
      "keyCount": 1
    }
  },
  "totals": {
    "students": 120,
    "activeStudents": 84,
    "certificates": 18
  }
}
```

### Student list item

```json
{
  "id": 12,
  "username": "student01",
  "fullName": "Ava Khan",
  "roomsStarted": 9,
  "roomsCompleted": 6,
  "certificateCount": 1,
  "inferredLevel": "Medium"
}
```

## Suggested external-app usage

```js
const response = await fetch('http://localhost:4000/api/public/summary', {
  headers: {
    'x-api-key': 'your_public_api_key',
  },
})

const data = await response.json()
console.log(data)
```

## Notes

- These endpoints are read-only.
- The API key should be treated like a secret.
- For production, use a long random key and keep it out of the frontend bundle.
