# Deployment Guide

This guide covers the easiest ways to deploy the Synthetic Persona Builder application and make it accessible to others.

## 🚀 Recommended: Railway (Easiest All-in-One)

Railway is the easiest option because it can deploy both frontend and backend, plus provides a PostgreSQL database, all in one place.

### Prerequisites
- GitHub account (to connect your repository)
- Railway account (sign up at [railway.app](https://railway.app) - free tier available)
- Google Gemini API key

### Step 1: Prepare Your Repository
1. Push your code to GitHub (if not already done)
2. Make sure you have a `.gitignore` that excludes `.env` files

### Step 2: Deploy Backend + Database on Railway

1. **Create a new project on Railway**
   - Go to [railway.app](https://railway.app)
   - Click "New Project"
   - Select "Deploy from GitHub repo"
   - Choose your repository

2. **Add PostgreSQL Database**
   - In your Railway project, click "+ New"
   - Select "Database" → "PostgreSQL"
   - Railway will automatically create a database and provide connection details

3. **Deploy Backend Service**
   - Click "+ New" → "GitHub Repo" (or "Empty Service")
   - Select your repository
   - Set the **Root Directory** to `backend`
   - Set the **Start Command** to: `npm start`
   - Railway will auto-detect Node.js

4. **Configure Backend Environment Variables**
   - Go to your backend service → "Variables" tab
   - Add these environment variables:
     ```
     DATABASE_URL=<automatically provided by Railway when you link the database>
     JWT_SECRET=<generate a random secret, e.g., use: openssl rand -base64 32>
     JWT_EXPIRES_IN=7d
     PORT=3001
     NODE_ENV=production
     CORS_ORIGIN=<your-frontend-url> (set this after deploying frontend)
     GEMINI_API_KEY=<your-gemini-api-key>
     ```

5. **Link Database to Backend**
   - In your backend service, go to "Variables" tab
   - Click "Reference Variable" 
   - Select your PostgreSQL service → `DATABASE_URL`
   - This automatically sets the database connection

6. **Run Database Migrations**
   - In Railway, go to your backend service
   - Click "Deployments" → "View Logs"
   - Open the "Shell" tab
   - Run: `npm run migrate`
   - Or add a one-time command in Railway: `npm run migrate && npm start`

7. **Get Backend URL**
   - Railway will provide a URL like: `https://your-backend.up.railway.app`
   - Copy this URL

### Step 3: Deploy Frontend on Railway

1. **Add Frontend Service**
   - In the same Railway project, click "+ New" → "GitHub Repo"
   - Select your repository
   - Set **Root Directory** to `.` (root)
   - Set **Build Command** to: `npm install && npm run build`
   - Set **Start Command** to: `npm run preview` (or use a static file server)
   - **Better option**: Use Railway's static file serving:
     - Install `serve`: Add to package.json devDependencies: `"serve": "^14.2.0"`
     - Set **Start Command** to: `npx serve -s dist -l 3000`

2. **Configure Frontend Environment Variables**
   - Go to frontend service → "Variables" tab
   - Add:
     ```
     VITE_API_URL=https://your-backend-url.up.railway.app/api
     VITE_GEMINI_API_KEY=<your-gemini-api-key>
     ```

3. **Update Backend CORS**
   - Go back to backend service → "Variables"
   - Update `CORS_ORIGIN` to your frontend URL (e.g., `https://your-frontend.up.railway.app`)

### Step 4: Custom Domain (Optional)
- Railway provides free `.railway.app` domains
- For custom domains, go to service → "Settings" → "Domains"

---

## 🎯 Alternative: Render (Also Easy, Good Free Tier)

### Backend on Render

1. **Create PostgreSQL Database**
   - Go to [render.com](https://render.com)
   - New → PostgreSQL
   - Create database (free tier available)

2. **Deploy Backend**
   - New → Web Service
   - Connect GitHub repo
   - Settings:
     - **Name**: `persona-builder-backend`
     - **Root Directory**: `backend`
     - **Environment**: Node
     - **Build Command**: `npm install && npm run build`
     - **Start Command**: `npm start`
   - Add environment variables (same as Railway)
   - Link PostgreSQL database

3. **Run Migrations**
   - Use Render Shell or add to build command: `npm run migrate && npm start`

### Frontend on Render

1. **Deploy Frontend**
   - New → Static Site
   - Connect GitHub repo
   - Settings:
     - **Root Directory**: `.`
     - **Build Command**: `npm install && npm run build`
     - **Publish Directory**: `dist`
   - Add environment variables:
     - `VITE_API_URL`
     - `VITE_GEMINI_API_KEY`

---

## 🔧 Alternative: Vercel (Frontend) + Railway/Render (Backend)

### Frontend on Vercel (Easiest for React apps)

1. **Deploy to Vercel**
   - Go to [vercel.com](https://vercel.com)
   - Import your GitHub repository
   - Vercel auto-detects Vite/React
   - Add environment variables:
     - `VITE_API_URL`
     - `VITE_GEMINI_API_KEY`
   - Deploy!

2. **Backend**: Use Railway or Render (see above)

---

## 📝 Environment Variables Checklist

### Backend (.env)
```
DATABASE_URL=postgresql://...
DB_HOST=...
DB_PORT=5432
DB_NAME=persona_builder
DB_USER=...
DB_PASSWORD=...
JWT_SECRET=<random-secret>
JWT_EXPIRES_IN=7d
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://your-frontend-url.com
GEMINI_API_KEY=your-key
```

### Frontend (.env)
```
VITE_API_URL=https://your-backend-url.com/api
VITE_GEMINI_API_KEY=your-key
```

---

## 🚨 Important Notes

1. **Database Migrations**: Must run migrations after first deployment
2. **CORS**: Backend CORS_ORIGIN must match your frontend URL
3. **API Keys**: Never commit `.env` files to Git
4. **HTTPS**: All production deployments use HTTPS automatically
5. **Free Tiers**: 
   - Railway: Free tier with usage limits
   - Render: Free tier (spins down after inactivity)
   - Vercel: Generous free tier for frontend

---

## 🔍 Testing Your Deployment

1. **Backend Health Check**: Visit `https://your-backend-url.com/health`
2. **Frontend**: Visit your frontend URL and try:
   - Register a new user
   - Login
   - Create a persona
   - Test chat functionality

---

## 🆘 Troubleshooting

### Cancel stuck deploys (Render) and retry

If **persona-builder-backend** or **persona-builder-frontend** show **"Online · Queued (XX:XX)"** or the dashboard says **"issue is upstream in GitHub"**:

1. **Cancel the stuck deploy**
   - Go to [dashboard.render.com](https://dashboard.render.com)
   - Open **persona-builder-backend** → **Events** (or **Logs**)
   - Find the deploy that is **Queued** or **Building** and click it
   - Click **Cancel** or **Cancel deploy**
   - Repeat for **persona-builder-frontend**

2. **Retry with a fresh deploy**
   - **Option A:** In each service, open **Manual Deploy** → **Deploy latest commit**
   - **Option B:** Push a new commit to your GitHub branch (e.g. a small doc or comment change); Render will start a new deploy and the queue will clear

3. **If GitHub is the “upstream” problem**
   - Check [GitHub Status](https://www.githubstatus.com/) for incidents
   - In Render, ensure the service is connected to the correct repo and branch
   - If the branch was force-pushed or rebased, try **Manual Deploy** so Render fetches the latest commit again

4. **Free tier queue**
   - On Render’s free tier, build workers are shared. If the queue stays long, wait a bit or retry later; cancelling and **Manual Deploy** often gets a new slot.

---

### Backend won't start
- Check environment variables are set correctly
- Verify DATABASE_URL is correct
- Check logs in Railway/Render dashboard

### CORS errors
- Ensure CORS_ORIGIN matches your frontend URL exactly
- Include protocol (https://) and no trailing slash

### Database connection errors
- Verify DATABASE_URL is set
- Check database is running (Render free tier spins down)
- Run migrations: `npm run migrate`

### Frontend can't reach backend
- Verify VITE_API_URL is correct
- Check backend is running and accessible
- Test backend health endpoint

---

## 💰 Cost Estimate

**Free Tier Options:**
- Railway: Free tier available (pay-as-you-go after)
- Render: Free tier (with limitations)
- Vercel: Free tier for frontend

**Typical Monthly Cost (if exceeding free tier):**
- Railway: $5-20/month
- Render: $7-25/month
- Vercel: Free for most use cases

---

## 🎉 Quick Start Summary

**Fastest Path (Railway):**
1. Push code to GitHub
2. Create Railway project
3. Add PostgreSQL database
4. Deploy backend (set root to `backend/`)
5. Deploy frontend (set root to `.`)
6. Set environment variables
7. Run migrations
8. Share your frontend URL!

**Total time: ~15-20 minutes**

