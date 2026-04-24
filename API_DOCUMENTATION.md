# API Documentation

## Base URL
```
http://localhost:3001/api
```

All endpoints except authentication require a JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## Authentication

### Register User
```http
POST /auth/register
Content-Type: application/json

{
  "username": "string",
  "password": "string",
  "email": "string (optional)"
}
```

**Response:**
```json
{
  "token": "jwt_token_string",
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string"
  }
}
```

### Login
```http
POST /auth/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "token": "jwt_token_string",
  "user": {
    "id": "uuid",
    "username": "string",
    "email": "string"
  }
}
```

## Personas

### Get All Personas
```http
GET /personas
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "name": "string",
    "type": "synthetic_user" | "advisor",
    "description": "string",
    "avatar_url": "string",
    "metadata": {},
    "created_at": "timestamp",
    "updated_at": "timestamp"
  }
]
```

### Get Persona by ID
```http
GET /personas/:id
Authorization: Bearer <token>
```

### Create Persona
```http
POST /personas
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "string",
  "type": "synthetic_user" | "advisor",
  "description": "string",
  "avatar_url": "string",
  "metadata": {}
}
```

### Update Persona
```http
PUT /personas/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "string (optional)",
  "description": "string (optional)",
  "avatar_url": "string (optional)",
  "metadata": {} (optional)
}
```

### Delete Persona
```http
DELETE /personas/:id
Authorization: Bearer <token>
```

### Get Persona Files
```http
GET /personas/:personaId/files
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "uuid",
    "persona_id": "uuid",
    "name": "string",
    "content": "string",
    "type": "markdown" | "pdf_analysis" | "linked_in_profile",
    "created_at": "timestamp"
  }
]
```

### Create Persona File
```http
POST /personas/:personaId/files
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "string",
  "content": "string",
  "type": "markdown" | "pdf_analysis" | "linked_in_profile"
}
```

## Chat Sessions

### Get All Chat Sessions
```http
GET /chat/sessions
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "name": "string",
    "created_at": "timestamp",
    "updated_at": "timestamp"
  }
]
```

### Get Chat Session by ID
```http
GET /chat/sessions/:id
Authorization: Bearer <token>
```

### Create Chat Session
```http
POST /chat/sessions
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "string",
  "personaIds": ["uuid", "uuid"]
}
```

### Update Chat Session
```http
PUT /chat/sessions/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "string"
}
```

### Delete Chat Session
```http
DELETE /chat/sessions/:id
Authorization: Bearer <token>
```

### Get Session Personas
```http
GET /chat/sessions/:sessionId/personas
Authorization: Bearer <token>
```

### Get Session Messages
```http
GET /chat/sessions/:sessionId/messages
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "uuid",
    "session_id": "uuid",
    "sender_type": "user" | "persona",
    "persona_id": "uuid (optional)",
    "content": "string",
    "created_at": "timestamp"
  }
]
```

### Create Message
```http
POST /chat/sessions/:sessionId/messages
Authorization: Bearer <token>
Content-Type: application/json

{
  "sender_type": "user" | "persona",
  "persona_id": "uuid (optional, required if sender_type is persona)",
  "content": "string"
}
```

## Simulation Sessions

### Get All Simulation Sessions
```http
GET /simulations
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "uuid",
    "user_id": "uuid",
    "persona_id": "uuid",
    "mode": "web_page" | "marketing" | "sales_pitch" | "investor_pitch",
    "bg_info": "string",
    "opening_line": "string (optional)",
    "stimulus_image": "string (optional)",
    "mime_type": "string (optional)",
    "name": "string",
    "created_at": "timestamp",
    "updated_at": "timestamp"
  }
]
```

### Get Simulation Session by ID
```http
GET /simulations/:id
Authorization: Bearer <token>
```

### Create Simulation Session
```http
POST /simulations
Authorization: Bearer <token>
Content-Type: application/json

{
  "persona_id": "uuid",
  "mode": "web_page" | "marketing" | "sales_pitch" | "investor_pitch",
  "bg_info": "string",
  "opening_line": "string (optional)",
  "stimulus_image": "string (optional)",
  "mime_type": "string (optional)",
  "name": "string"
}
```

### Update Simulation Session
```http
PUT /simulations/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "string (optional)",
  "bg_info": "string (optional)",
  "opening_line": "string (optional)",
  "stimulus_image": "string (optional)",
  "mime_type": "string (optional)"
}
```

### Delete Simulation Session
```http
DELETE /simulations/:id
Authorization: Bearer <token>
```

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message description"
}
```

**Status Codes:**
- `200` - Success
- `201` - Created
- `204` - No Content (successful delete)
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `409` - Conflict (e.g., username already exists)
- `500` - Internal Server Error


