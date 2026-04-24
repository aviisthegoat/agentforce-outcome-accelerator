# 🚀 Quick Start Guide - Fastest Way to Run This App

## Prerequisites
- Node.js 18+ installed
- Docker Desktop installed (for PostgreSQL) - [Download here](https://www.docker.com/products/docker-desktop)
- Google Gemini API key - [Get one here](https://makersuite.google.com/app/apikey)

## Fastest Setup (5 minutes)

### Step 1: Start PostgreSQL with Docker
```bash
docker run --name persona-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=persona_builder \
  -p 5432:5432 \
  -d postgres:14
```

### Step 2: Install Dependencies
```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies (from project root)
cd ..
npm install
```

### Step 3: Configure Environment Variables

**Backend `.env` file** (create `backend/.env`):
```env
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
```

**Frontend `.env` file** (create `.env` in project root):
```env
VITE_API_URL=http://localhost:3001/api
VITE_GEMINI_API_KEY=your-gemini-api-key-here
```

### Step 4: Run Database Migrations
```bash
cd backend
npm run migrate
```

### Step 5: Start the Application

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

### Step 6: Open the App
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## 🎯 What You Need to Do

1. **Get a Gemini API Key**: Visit https://makersuite.google.com/app/apikey
2. **Replace `your-gemini-api-key-here`** in both `.env` files with your actual API key
3. **Register a new account** when you first open the app

## 🔧 Alternative: Without Docker (if you have PostgreSQL installed)

If you already have PostgreSQL running locally:

```bash
createdb persona_builder
```

Then use your local PostgreSQL credentials in `backend/.env` instead of the Docker setup.

## 📝 Troubleshooting

**Docker container already exists?**
```bash
docker start persona-postgres
```

**Need to recreate the database?**
```bash
docker stop persona-postgres
docker rm persona-postgres
# Then run the docker run command again from Step 1
```

**Port 5432 already in use?**
- Stop your local PostgreSQL: `brew services stop postgresql` (macOS)
- Or use a different port in Docker: `-p 5433:5432` and update `DB_PORT=5433` in `.env`

## 🎉 That's It!

Once both servers are running, you can:
- Register a new user account
- Create synthetic personas
- Chat with personas
- Run simulations


