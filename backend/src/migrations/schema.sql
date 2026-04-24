-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Business profiles table (1:1 with users)
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
);

-- Personas table
CREATE TABLE IF NOT EXISTS personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('synthetic_user', 'advisor', 'specialty_goods_retailer')),
  description TEXT,
  avatar_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Persona files table
CREATE TABLE IF NOT EXISTS persona_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('markdown', 'pdf_analysis', 'linked_in_profile')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Focus groups (user-defined groups of personas for "add all" in Chat/Simulation)
CREATE TABLE IF NOT EXISTS focus_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS focus_group_personas (
  focus_group_id UUID NOT NULL REFERENCES focus_groups(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  PRIMARY KEY (focus_group_id, persona_id)
);

-- Chat sessions table
CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Chat session personas junction table
CREATE TABLE IF NOT EXISTS chat_session_personas (
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  PRIMARY KEY (session_id, persona_id)
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  sender_type VARCHAR(10) NOT NULL CHECK (sender_type IN ('user', 'persona')),
  persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Simulation sessions table
CREATE TABLE IF NOT EXISTS simulation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
  persona_ids JSONB,
  mode VARCHAR(50) NOT NULL CHECK (mode IN ('web_page', 'marketing', 'sales_pitch', 'investor_pitch')),
  bg_info TEXT NOT NULL,
  opening_line TEXT,
  stimulus_image TEXT,
  mime_type VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Simulations table (templates for simulation modes)
CREATE TABLE IF NOT EXISTS simulations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  required_input_fields JSONB DEFAULT '[]',
  system_prompt TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  simulation_type VARCHAR(50) DEFAULT 'report',
  allowed_persona_types JSONB DEFAULT '["synthetic_user","advisor"]',
  persona_count_min INTEGER DEFAULT 1,
  persona_count_max INTEGER DEFAULT 1,
  type_specific_config JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_business_profiles_user_id ON business_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_personas_user_id ON personas(user_id);
CREATE INDEX IF NOT EXISTS idx_persona_files_persona_id ON persona_files(persona_id);
CREATE INDEX IF NOT EXISTS idx_focus_groups_user_id ON focus_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_focus_group_personas_group_id ON focus_group_personas(focus_group_id);
CREATE INDEX IF NOT EXISTS idx_focus_group_personas_persona_id ON focus_group_personas(persona_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_simulation_sessions_user_id ON simulation_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_simulation_sessions_persona_id ON simulation_sessions(persona_id);
CREATE INDEX IF NOT EXISTS idx_simulations_is_active ON simulations(is_active);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at (drop if exists first to make idempotent)
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_business_profiles_updated_at ON business_profiles;
CREATE TRIGGER update_business_profiles_updated_at BEFORE UPDATE ON business_profiles
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_personas_updated_at ON personas;
CREATE TRIGGER update_personas_updated_at BEFORE UPDATE ON personas
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_focus_groups_updated_at ON focus_groups;
CREATE TRIGGER update_focus_groups_updated_at BEFORE UPDATE ON focus_groups
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON chat_sessions;
CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON chat_sessions
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_simulation_sessions_updated_at ON simulation_sessions;
CREATE TRIGGER update_simulation_sessions_updated_at BEFORE UPDATE ON simulation_sessions
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

DROP TRIGGER IF EXISTS update_simulations_updated_at ON simulations;
CREATE TRIGGER update_simulations_updated_at BEFORE UPDATE ON simulations
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

