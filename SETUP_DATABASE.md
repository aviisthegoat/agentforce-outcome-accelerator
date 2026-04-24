# Database Setup Instructions

The "Internal server error" you're seeing is because PostgreSQL isn't set up yet. Follow these steps:

## Option 1: Install PostgreSQL Locally

### macOS (using Homebrew):
```bash
brew install postgresql@14
brew services start postgresql@14
```

### Create Database:
```bash
createdb persona_builder
```

### Create .env file in backend/ directory:
```bash
cd backend
cat > .env << EOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=persona_builder
DB_USER=$(whoami)
DB_PASSWORD=

JWT_SECRET=dev-secret-key-change-in-production
JWT_EXPIRES_IN=7d

PORT=3001
NODE_ENV=development

CORS_ORIGIN=http://localhost:3000

GEMINI_API_KEY=your-gemini-api-key-here
EOF
```

### Run Migrations:
```bash
npm run migrate
```

## Option 2: Use Docker (Easier)

If you have Docker installed:

```bash
# Start PostgreSQL in Docker
docker run --name persona-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=persona_builder \
  -p 5432:5432 \
  -d postgres:14

# Create .env file
cd backend
cat > .env << EOF
DB_HOST=localhost
DB_PORT=5432
DB_NAME=persona_builder
DB_USER=postgres
DB_PASSWORD=postgres

JWT_SECRET=dev-secret-key-change-in-production
JWT_EXPIRES_IN=7d

PORT=3001
NODE_ENV=development

CORS_ORIGIN=http://localhost:3000

GEMINI_API_KEY=your-gemini-api-key-here
EOF

# Run migrations
npm run migrate
```

## Option 3: Use a Cloud Database

You can use services like:
- Supabase (free tier available)
- Neon (free tier available)
- Railway
- Render

Just get the connection string and use it in your `.env` file as `DATABASE_URL`.

## After Setup

1. Restart the backend server (it should pick up the new .env file)
2. Try registering again

The backend server needs to be restarted after creating the .env file.


