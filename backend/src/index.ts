import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pool from './config/database.js';
import authRoutes from './routes/authRoutes.js';
import personaRoutes from './routes/personaRoutes.js';
import chatRoutes from './routes/chatRoutes.js';
import simulationRoutes from './routes/simulationRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import businessProfileRoutes from './routes/businessProfileRoutes.js';
import focusGroupRoutes from './routes/focusGroupRoutes.js';
import agentRoutes from './routes/agentRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import { errorHandler } from './middleware/errorHandler.js';

dotenv.config();

function validateGeminiApiKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.includes('${') || key === 'your-gemini-api-key-here') {
    console.error(
      '\n⚠️  GEMINI_API_KEY is not configured!\n' +
      '   Embedding and AI features will not work.\n' +
      '   Set a valid key in backend/.env (get one at https://aistudio.google.com/apikey)\n'
    );
  } else {
    console.log('✅ GEMINI_API_KEY is configured');
  }
}
validateGeminiApiKey();

const app = express();
const PORT = parseInt(process.env.PORT || '3001', 10);
const CORS_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:3000,http://127.0.0.1:5173,http://localhost:5173').split(',');

// Middleware
app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true,
}));
// Increase body size limit to handle base64-encoded images (50MB limit)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/personas', personaRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/simulations', simulationRoutes);
app.use('/api/profile/business', businessProfileRoutes);
app.use('/api/focus-groups', focusGroupRoutes);
// Admin routes
app.use('/api/admin', adminRoutes);
// Agent routes (RAG + multi-step reasoning)
app.use('/api/agent', agentRoutes);
app.use('/api/ai', aiRoutes);

// Error handling
app.use(errorHandler);

// Ensure business_profiles table exists (self-heal if migrations didn't run or failed)
async function ensureBusinessProfilesTable() {
  try {
    await pool.query('SELECT 1 FROM business_profiles LIMIT 1');
  } catch (err: unknown) {
    const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
    if (code === '42P01') {
      console.log('Creating business_profiles table...');
      await pool.query(`
        CREATE TABLE IF NOT EXISTS business_profiles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
          business_name TEXT,
          mission_statement TEXT,
          vision_statement TEXT,
          description_main_offerings TEXT,
          key_features_or_benefits TEXT,
          unique_selling_proposition TEXT,
          pricing_model TEXT,
          customer_segments TEXT,
          geographic_focus TEXT,
          industry_served TEXT,
          what_differentiates TEXT,
          market_niche TEXT,
          revenue_streams TEXT,
          distribution_channels TEXT,
          key_personnel TEXT,
          major_achievements TEXT,
          revenue TEXT,
          key_performance_indicators TEXT,
          funding_rounds TEXT,
          website TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query('CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON business_profiles(user_id)');
      console.log('business_profiles table ready.');
    } else {
      throw err;
    }
  }
}

async function ensureEmbeddingColumns() {
  try {
    await pool.query('ALTER TABLE personas ADD COLUMN IF NOT EXISTS last_embedded_at TIMESTAMP');
  } catch (_) { /* column may already exist */ }
}

// Start server - bind to 0.0.0.0 to accept external connections (required for Railway)
ensureBusinessProfilesTable()
  .then(() => ensureEmbeddingColumns())
  .then(() => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 CORS enabled for: ${CORS_ORIGINS.join(', ')}`);
    });
  })
  .catch((err) => {
    console.error('Startup failed:', err);
    process.exit(1);
  });

