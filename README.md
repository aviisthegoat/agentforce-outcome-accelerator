# Agentforce Outcome Accelerator

A full-stack diagnostic and tracking application designed for Applied AI Coaches to build, measure, and optimize Agentforce-like synthetic personas. The app allows coaches to track AI outcomes against business cases, run four-week sprints (simulations) to resolve performance issues, and demonstrate tangible value over time.

## Architecture

The application follows an MVC (Model-View-Controller) architecture:

- **Backend**: Express.js + TypeScript with PostgreSQL database
- **Frontend**: React + TypeScript with Vite
- **Database**: PostgreSQL with proper user isolation
- **Authentication**: JWT-based authentication with password hashing

## Project Structure

```
├── backend/                 # Backend API server
│   ├── src/
│   │   ├── config/         # Database configuration
│   │   ├── controllers/    # Request handlers (MVC Controllers)
│   │   ├── services/       # Business logic layer
│   │   ├── models/         # Database models/types
│   │   ├── routes/         # API route definitions
│   │   ├── middleware/     # Auth & error handling
│   │   ├── utils/          # Helper functions
│   │   └── migrations/     # Database schema
│   └── package.json
│
├── src/                     # Frontend application
│   ├── views/              # Page components (MVC Views)
│   ├── components/         # Reusable UI components
│   ├── hooks/              # Custom React hooks (MVC Controllers)
│   ├── services/          # API client services
│   ├── models/            # Type definitions
│   ├── context/           # React context providers
│   └── utils/             # Helper functions
│
└── templates/              # Gemini AI templates for persona generation
```

## Prerequisites

- Node.js 18+ and npm
- PostgreSQL 12+
- Google Gemini API key

## Setup Instructions

### 1. Database Setup

Create a PostgreSQL database:

```bash
createdb persona_builder
```

Or using psql:

```sql
CREATE DATABASE persona_builder;
```

### 2. Backend Setup

```bash
cd backend
npm install
```

Create a `.env` file in the `backend/` directory:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/persona_builder
DB_HOST=localhost
DB_PORT=5432
DB_NAME=persona_builder
DB_USER=your_username
DB_PASSWORD=your_password

JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

PORT=3001
NODE_ENV=development

CORS_ORIGIN=http://localhost:3000

GEMINI_API_KEY=your-gemini-api-key
```

Run database migrations:

```bash
npm run migrate
```

Start the backend server:

```bash
npm run dev
```

The backend will run on `http://localhost:3001`

### 3. Frontend Setup

```bash
# From project root
npm install
```

Create a `.env` file in the project root:

```env
VITE_API_URL=http://localhost:3001/api
VITE_GEMINI_API_KEY=your-gemini-api-key
```

Start the development server:

```bash
npm run dev
```

The frontend will run on `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user

### Personas
- `GET /api/personas` - Get all personas for current user
- `GET /api/personas/:id` - Get persona by ID
- `POST /api/personas` - Create new persona
- `PUT /api/personas/:id` - Update persona
- `DELETE /api/personas/:id` - Delete persona
- `GET /api/personas/:personaId/files` - Get persona files
- `POST /api/personas/:personaId/files` - Create persona file

### Chat
- `GET /api/chat/sessions` - Get all chat sessions
- `GET /api/chat/sessions/:id` - Get chat session by ID
- `POST /api/chat/sessions` - Create new chat session
- `PUT /api/chat/sessions/:id` - Update chat session
- `DELETE /api/chat/sessions/:id` - Delete chat session
- `GET /api/chat/sessions/:sessionId/personas` - Get session personas
- `GET /api/chat/sessions/:sessionId/messages` - Get session messages
- `POST /api/chat/sessions/:sessionId/messages` - Create message

### Simulations
- `GET /api/simulations` - Get all simulation sessions
- `GET /api/simulations/:id` - Get simulation session by ID
- `POST /api/simulations` - Create simulation session
- `PUT /api/simulations/:id` - Update simulation session
- `DELETE /api/simulations/:id` - Delete simulation session

All endpoints (except auth) require authentication via JWT token in the `Authorization: Bearer <token>` header.

## Features

- **User Authentication**: Secure registration and login with JWT tokens
- **Agent Configuration (Personas)**: Define Agentforce personas with strict prompt engineering and vibe-coding tools.
- **Agent Console (Chat)**: Chat with one or multiple agents to observe unexpected AI model behavior or drift over time.
- **Outcome Sprints (Simulations)**: Run targeted simulation scenarios (sales pitch, investor pitch, support) to test performance and stability in production.
- **Agent Blueprint (Files)**: Store prompt templates and documentation for each agent's deployment process.
- **Data Narratives**: User isolation allows coaches to craft compelling stories proving the value of their own AI portfolios.

## Development

### Backend Development

```bash
cd backend
npm run dev  # Start with hot reload
npm run build  # Build for production
npm start  # Run production build
```

### Frontend Development

```bash
npm run dev  # Start Vite dev server
npm run build  # Build for production
npm run preview  # Preview production build
```

## Database Schema

The database includes the following tables:
- `users` - User accounts
- `personas` - Persona definitions
- `persona_files` - Files associated with personas
- `chat_sessions` - Chat conversation sessions
- `chat_session_personas` - Junction table for session-persona relationships
- `messages` - Chat messages
- `simulation_sessions` - Simulation sessions

All tables include proper foreign key constraints and indexes for performance.

_Last updated: February 2025_

## Security

- Passwords are hashed using bcrypt
- JWT tokens for authentication
- User data isolation at the database level
- CORS configuration for API security
- Input validation on all endpoints

## License

Private project - All rights reserved
