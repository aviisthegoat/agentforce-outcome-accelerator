import pool from '../config/database.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function migrate() {
  try {
    console.log('Running database migrations...');
    
    const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
    
    await pool.query(schema);
    
    // Ensure business_profiles exists (for DBs created before this table was in schema)
    try {
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
    } catch (err: any) {
      if (err.code !== '42P07') throw err;
    }

    // Widen business_profiles text columns (VARCHAR -> TEXT) so long content doesn't fail
    for (const col of ['business_name', 'industry_served', 'website']) {
      try {
        await pool.query(`ALTER TABLE business_profiles ALTER COLUMN ${col} TYPE TEXT`);
      } catch (err: any) {
        if (err.code !== '42P01') throw err;
      }
    }

    // Add is_admin column if it doesn't exist (for existing databases)
    try {
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE');
    } catch (err: any) {
      // Column might already exist, ignore
      if (err.code !== '42701') {
        throw err;
      }
    }

    // Add simulation type and config columns if they don't exist
    const simColumns = [
      `ALTER TABLE simulations ADD COLUMN IF NOT EXISTS simulation_type VARCHAR(50) DEFAULT 'report'`,
      `ALTER TABLE simulations ADD COLUMN IF NOT EXISTS allowed_persona_types JSONB DEFAULT '["synthetic_user","advisor"]'`,
      `ALTER TABLE simulations ADD COLUMN IF NOT EXISTS persona_count_min INTEGER DEFAULT 1`,
      `ALTER TABLE simulations ADD COLUMN IF NOT EXISTS persona_count_max INTEGER DEFAULT 1`,
      `ALTER TABLE simulations ADD COLUMN IF NOT EXISTS type_specific_config JSONB DEFAULT '{}'`,
    ];
    for (const sql of simColumns) {
      try {
        await pool.query(sql);
      } catch (err: any) {
        if (err.code !== '42701') throw err;
      }
    }

    // Persona visibility and persona_stars for library/starring; restrict persona type to core types: synthetic_user, advisor
    try {
      await pool.query(`UPDATE personas SET type = 'advisor' WHERE type = 'practice_person'`);
      await pool.query(`UPDATE personas SET type = 'synthetic_user' WHERE type = 'specialty_goods_retailer'`);
      await pool.query(`ALTER TABLE personas DROP CONSTRAINT IF EXISTS personas_type_check`);
      await pool.query(`ALTER TABLE personas ADD CONSTRAINT personas_type_check CHECK (type IN ('synthetic_user', 'advisor'))`);
    } catch (err: any) {
      if (err.code !== '42701' && err.code !== '42P01') throw err;
    }

    // Rename conversational_simulation to persuasion_simulation
    try {
      await pool.query(`UPDATE simulations SET simulation_type = 'persuasion_simulation' WHERE simulation_type = 'conversational_simulation'`);
    } catch (err: any) {
      // Non-fatal; column might not exist in very old DBs
    }

    // Add persona_ids to simulation_sessions for multi-persona simulations
    try {
      await pool.query(`ALTER TABLE simulation_sessions ADD COLUMN IF NOT EXISTS persona_ids JSONB DEFAULT NULL`);
    } catch (err: any) {
      if (err.code !== '42701') throw err;
    }

    // Persuasion context: system_prompt on session + simulation_messages table
    try {
      await pool.query(`ALTER TABLE simulation_sessions ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT NULL`);
    } catch (err: any) {
      if (err.code !== '42701') throw err;
    }
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS simulation_messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          simulation_session_id UUID NOT NULL REFERENCES simulation_sessions(id) ON DELETE CASCADE,
          sender_type VARCHAR(20) NOT NULL,
          persona_id UUID REFERENCES personas(id) ON DELETE SET NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_simulation_messages_session_id ON simulation_messages(simulation_session_id)`);
    } catch (err: any) {
      if (err.code !== '42P07') throw err;
    }

    // Add thinking column to simulation_messages for agent reasoning persistence
    try {
      await pool.query(`ALTER TABLE simulation_messages ADD COLUMN IF NOT EXISTS thinking TEXT DEFAULT NULL`);
    } catch (err: any) {
      if (err.code !== '42701') throw err;
    }

    // Add retrieval_summary and validation columns for pipeline trace persistence
    try {
      await pool.query(`ALTER TABLE simulation_messages ADD COLUMN IF NOT EXISTS retrieval_summary JSONB DEFAULT NULL`);
    } catch (err: any) {
      if (err.code !== '42701') throw err;
    }
    try {
      await pool.query(`ALTER TABLE simulation_messages ADD COLUMN IF NOT EXISTS validation JSONB DEFAULT NULL`);
    } catch (err: any) {
      if (err.code !== '42701') throw err;
    }

    // Persona visibility and persona_stars for library/starring
    try {
      await pool.query(`ALTER TABLE personas ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) NOT NULL DEFAULT 'private'`);
      await pool.query(`ALTER TABLE personas DROP CONSTRAINT IF EXISTS personas_visibility_check`);
      await pool.query(`ALTER TABLE personas ADD CONSTRAINT personas_visibility_check CHECK (visibility IN ('private', 'public', 'global'))`);
      await pool.query(`UPDATE personas SET visibility = 'private' WHERE visibility IS NULL OR visibility = ''`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_personas_visibility ON personas(visibility)`);
    } catch (err: any) {
      if (err.code !== '42701' && err.code !== '42P07') throw err;
    }
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS persona_stars (
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
          PRIMARY KEY (user_id, persona_id)
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_persona_stars_user_id ON persona_stars(user_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_persona_stars_persona_id ON persona_stars(persona_id)`);
    } catch (err: any) {
      if (err.code !== '42P07') throw err;
    }

    // Focus groups: user-defined groups of personas (for "add all" in Chat/Simulation)
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS focus_groups (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_focus_groups_user_id ON focus_groups(user_id)`);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS focus_group_personas (
          focus_group_id UUID NOT NULL REFERENCES focus_groups(id) ON DELETE CASCADE,
          persona_id UUID NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
          position INTEGER DEFAULT 0,
          PRIMARY KEY (focus_group_id, persona_id)
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_focus_group_personas_group_id ON focus_group_personas(focus_group_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_focus_group_personas_persona_id ON focus_group_personas(persona_id)`);
      await pool.query(`ALTER TABLE focus_groups ADD COLUMN IF NOT EXISTS allowed_persona_types JSONB`);
    } catch (err: any) {
      if (err.code !== '42P07') throw err;
    }
    
    // Knowledge chunks table for RAG embeddings
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS knowledge_chunks (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          persona_id UUID REFERENCES personas(id) ON DELETE CASCADE,
          session_id UUID,
          source_type VARCHAR(50) NOT NULL,
          source_name VARCHAR(255),
          chunk_text TEXT NOT NULL,
          chunk_index INTEGER NOT NULL DEFAULT 0,
          embedding FLOAT8[],
          content_hash VARCHAR(64),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_kc_persona ON knowledge_chunks(persona_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_kc_session ON knowledge_chunks(session_id)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_kc_hash ON knowledge_chunks(content_hash)`);
      await pool.query(`ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE`);
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_kc_user ON knowledge_chunks(user_id)`);
    } catch (err: any) {
      if (err.code !== '42P07') throw err;
    }

    // Track when each persona was last successfully embedded
    try {
      await pool.query(`ALTER TABLE personas ADD COLUMN IF NOT EXISTS last_embedded_at TIMESTAMP`);
    } catch (err: any) {
      if (err.code !== '42701') throw err;
    }

    console.log('Seeding default simulations...');
    
    // Check if simulations already exist
    const existingSims = await pool.query('SELECT COUNT(*) FROM simulations');
    if (existingSims.rows[0].count === '0') {
      const simulations = [
        {
          title: 'Web Page Response',
          description: 'Stress-test your strategy using this specialized simulation prompt.',
          icon: 'Monitor',
          required_input_fields: JSON.stringify([
            { name: 'bgInfo', type: 'textarea', label: 'Background Context', placeholder: 'Describe the product or situation context...', required: true },
            { name: 'stimulusImage', type: 'image', label: 'Upload Visual Stimulus', placeholder: 'Upload Web Page or Ad Image', required: true }
          ]),
          system_prompt: `### CORE DIRECTIVE
You ARE the persona defined in {{SELECTED_PROFILE}}. Respond only as them—never describe, reference, or embed the persona in your reply. Speak in first person as the persona. Do not break character. Do not act as an AI assistant.

### INPUTS
**Note:** Only item 1 (Who You Are) defines the persona. Items 2 and below are provided by the **person running the simulation** (the user)—e.g. their context or business—not by the persona.
1. **Who You Are (Profile):** {{SELECTED_PROFILE_FULL}}
2. **Context:** {{BACKGROUND_INFO}}
3. **Visual Stimulus:** [User has uploaded an image of a webpage].

### INSTRUCTIONS
1. Analyze the uploaded image through the eyes of your Profile.
2. Considering your Profile's specific pain points, age, tech-savviness, and goals:
   - Does this page make sense to you?
   - Is the text readable for you?
   - Does the design appeal to your specific taste?
3. Simulate your internal monologue or a user-testing feedback session.

### INTERACTION
Begin by stating your first impression of the page shown in the image, speaking strictly in the voice and tone of the persona—as if you are that person.`
        },
        {
          title: 'Marketing Material',
          description: 'Stress-test your strategy using this specialized simulation prompt.',
          icon: 'Megaphone',
          required_input_fields: JSON.stringify([
            { name: 'bgInfo', type: 'textarea', label: 'Background Context', placeholder: 'Describe the product or situation context...', required: true },
            { name: 'stimulusImage', type: 'image', label: 'Upload Visual Stimulus', placeholder: 'Upload Web Page or Ad Image', required: true }
          ]),
          system_prompt: `### CORE DIRECTIVE
You ARE the target audience member described in {{SELECTED_PROFILE}}. React instinctively as that person—never describe or reference the persona in your reply; speak in first person only. You are NOT a marketing expert.

### INPUTS
**Note:** Only item 1 (Who You Are) defines the persona. Items 2 and below are provided by the **person running the simulation** (the user)—e.g. their context or business—not by the persona.
1. **Who You Are (Profile):** {{SELECTED_PROFILE_FULL}}
2. **Product Context:** {{BACKGROUND_INFO}}
3. **Marketing Asset:** [User has uploaded an image/file].

### INSTRUCTIONS
1. Look at the uploaded marketing material.
2. Based *strictly* on your Profile's interests, budget, and personality:
   - Would you stop scrolling to look at this?
   - Do you understand what is being sold?
   - Does the visual style trust or annoy you?
3. If the ad doesn't fit your specific worldview, reject it. If it does, show interest.

### INTERACTION
Provide a raw, unfiltered reaction to the image as if you just saw it on your feed/email, in the persona's own voice and vocabulary—answer only as that person.`
        },
        {
          title: 'Sales Pitch',
          description: 'Stress-test your strategy using this specialized simulation prompt.',
          icon: 'TrendingUp',
          required_input_fields: JSON.stringify([
            { name: 'bgInfo', type: 'textarea', label: 'Background Context', placeholder: 'Describe the product or situation context...', required: true },
            { name: 'openingLine', type: 'textarea', label: 'Opening Line / Content', placeholder: 'Paste your opening line or pitch deck summary...', required: true }
          ]),
          system_prompt: `### CORE DIRECTIVE
You ARE the persona {{SELECTED_PROFILE}}. The user is trying to sell to you. Respond exactly how this person would in real life—only as that person; never describe or reference the persona in your reply.

### INPUTS
**Note:** Only item 1 (Who You Are) defines the persona. Items 2 and below are provided by the **person running the simulation** (the user)—e.g. their context or business—not by the persona.
1. **Who You Are (Profile):** {{SELECTED_PROFILE_FULL}}
2. **Context:** {{BACKGROUND_INFO}}
3. **User's Opening Line:** {{OPENING_LINE}}

### INSTRUCTIONS
1. Analyze the User's opening line.
2. Consult your Profile: Are you busy? Are you skeptical? Do you have budget authority? What are your specific triggers?
3. Respond to the opening line.
   - If the line is weak or irrelevant to your Profile, shut them down or be dismissive.
   - If the line hooks your specific interests, engage cautiously.

### INTERACTION
Reply to the {{OPENING_LINE}} immediately in character. Do not provide feedback; simply *be* the prospect—answer only as that person.`
        },
        {
          title: 'Investor Pitch',
          description: 'Stress-test your strategy using this specialized simulation prompt.',
          icon: 'Briefcase',
          required_input_fields: JSON.stringify([
            { name: 'bgInfo', type: 'textarea', label: 'Background Context', placeholder: 'Describe the product or situation context...', required: true },
            { name: 'openingLine', type: 'textarea', label: 'Opening Line / Content', placeholder: 'Paste your opening line or pitch deck summary...', required: true }
          ]),
          system_prompt: `### CORE DIRECTIVE
You ARE the Investor defined in {{SELECTED_PROFILE}}. Evaluate opportunities strictly based on your specific investment thesis and personality. Respond only as that person—never describe or reference the persona in your reply; speak in first person.

### INPUTS
**Note:** Only item 1 (Who You Are) defines the persona. Items 2 and below are provided by the **person running the simulation** (the user)—e.g. their context or business—not by the persona.
1. **Who You Are (Profile):** {{SELECTED_PROFILE_FULL}}
2. **Startup Info:** {{BACKGROUND_INFO}}
3. **Pitch Deck/Data:** {{OPENING_LINE}}

### INSTRUCTIONS
1. Review the startup materials provided.
2. Compare the startup against your Profile's specific criteria.
3. Identify the gap between what was pitched and what *you* care about.

### INTERACTION
Start the simulation. You have just reviewed the deck. Address the founder (User) and state your primary concern or question—answer only as the investor persona.`
        }
      ];

      for (const sim of simulations) {
        await pool.query(
          `INSERT INTO simulations (id, title, description, icon, required_input_fields, system_prompt, is_active)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, TRUE)
           ON CONFLICT DO NOTHING`,
          [sim.title, sim.description, sim.icon, sim.required_input_fields, sim.system_prompt]
        );
      }
      
      console.log('✅ Default simulations seeded successfully!');
    } else {
      console.log('⚠️  Simulations already exist, skipping seed');
    }
    
    console.log('✅ Database migrations completed successfully!');
    process.exit(0);
  } catch (error: any) {
    // If it's a duplicate object error, it might be okay if migration was already run
    if (error.code === '42710') {
      console.warn('⚠️  Some objects already exist (migration may have run before)');
      console.log('✅ Migration completed (with warnings)');
      process.exit(0);
    } else {
      console.error('❌ Migration failed:', error);
      process.exit(1);
    }
  }
}

migrate();

