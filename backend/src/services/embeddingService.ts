import { GoogleGenAI } from '@google/genai';
import { createHash } from 'crypto';
import pool from '../config/database.js';

const EMBEDDING_MODEL = 'gemini-embedding-001';
const CHUNK_MAX_WORDS = 400;
const CHUNK_OVERLAP_WORDS = 80;
const EMBED_BATCH_SIZE = 100;

function getAI(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.includes('${') || apiKey === 'your-gemini-api-key-here') {
    throw new Error('GEMINI_API_KEY is not configured. Set a valid key in backend/.env');
  }
  return new GoogleGenAI({ apiKey });
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export function chunkText(text: string, maxWords = CHUNK_MAX_WORDS, overlapWords = CHUNK_OVERLAP_WORDS): string[] {
  const trimmed = (text || '').trim();
  if (!trimmed) return [];

  const paragraphs = trimmed.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentWords: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    if (currentWords.length + words.length > maxWords && currentWords.length > 0) {
      chunks.push(currentWords.join(' '));
      const overlapStart = Math.max(0, currentWords.length - overlapWords);
      currentWords = currentWords.slice(overlapStart);
    }

    currentWords.push(...words);

    while (currentWords.length > maxWords) {
      const slice = currentWords.slice(0, maxWords);
      chunks.push(slice.join(' '));
      const overlapStart = Math.max(0, maxWords - overlapWords);
      currentWords = currentWords.slice(overlapStart);
    }
  }

  if (currentWords.length > 0) {
    chunks.push(currentWords.join(' '));
  }

  return chunks;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const ai = getAI();
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    console.log(`[EMBED] Calling text-embedding-004 for ${batch.length} texts (batch ${Math.floor(i / EMBED_BATCH_SIZE) + 1})`);
    const response = await ai.models.embedContent({
      model: EMBEDDING_MODEL,
      contents: batch,
    });
    const embeddings = response.embeddings;
    if (!embeddings || embeddings.length === 0) {
      throw new Error(`Embedding API returned no embeddings for batch of ${batch.length} texts`);
    }
    for (const emb of embeddings) {
      if (!emb.values || emb.values.length === 0) {
        throw new Error('Embedding API returned empty values for a text');
      }
      allEmbeddings.push(emb.values);
    }
    console.log(`[EMBED] Got ${embeddings.length} embeddings (${embeddings[0]?.values?.length || 0}-dim)`);
  }

  return allEmbeddings;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export async function indexPersona(personaId: string): Promise<void> {
  const personaResult = await pool.query(
    'SELECT id, name, description FROM personas WHERE id = $1',
    [personaId]
  );
  if (personaResult.rows.length === 0) return;

  const persona = personaResult.rows[0];
  const filesResult = await pool.query(
    'SELECT id, name, content, type FROM persona_files WHERE persona_id = $1',
    [personaId]
  );

  interface ChunkEntry {
    text: string;
    sourceType: string;
    sourceName: string;
    index: number;
  }
  const allChunks: ChunkEntry[] = [];

  if (persona.description) {
    const profileText = `Name: ${persona.name}\n\n${persona.description}`;
    const chunks = chunkText(profileText);
    chunks.forEach((text, idx) => {
      allChunks.push({ text, sourceType: 'profile', sourceName: 'description', index: idx });
    });
  }

  for (const file of filesResult.rows) {
    if (!file.content) continue;
    const chunks = chunkText(file.content);
    chunks.forEach((text, idx) => {
      allChunks.push({ text, sourceType: 'file', sourceName: file.name, index: idx });
    });
  }

  if (allChunks.length === 0) return;

  const embeddings = await embedTexts(allChunks.map(c => c.text));

  await pool.query('DELETE FROM knowledge_chunks WHERE persona_id = $1', [personaId]);

  const insertValues: string[] = [];
  const insertParams: any[] = [];
  let paramIdx = 1;

  for (let i = 0; i < allChunks.length; i++) {
    const chunk = allChunks[i];
    const embedding = embeddings[i];
    const hash = sha256(chunk.text);
    const embeddingPgArray = `{${embedding.join(',')}}`;
    insertValues.push(
      `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}::float8[], $${paramIdx + 6})`
    );
    insertParams.push(personaId, chunk.sourceType, chunk.sourceName, chunk.text, chunk.index, embeddingPgArray, hash);
    paramIdx += 7;
  }

  if (insertValues.length > 0) {
    await pool.query(
      `INSERT INTO knowledge_chunks (persona_id, source_type, source_name, chunk_text, chunk_index, embedding, content_hash)
       VALUES ${insertValues.join(', ')}`,
      insertParams
    );
    console.log(`[EMBED] Inserted ${insertValues.length} chunks for persona ${personaId}`);
  }

  await pool.query(
    'UPDATE personas SET last_embedded_at = CURRENT_TIMESTAMP WHERE id = $1',
    [personaId]
  );

  console.log(`Indexed ${allChunks.length} chunks for persona ${personaId}`);
}

export async function indexBusinessProfile(userId: string): Promise<void> {
  const result = await pool.query(
    `SELECT business_name, mission_statement, vision_statement, description_main_offerings,
            key_features_or_benefits, unique_selling_proposition, pricing_model, customer_segments,
            geographic_focus, industry_served, what_differentiates, market_niche, revenue_streams,
            distribution_channels, key_personnel, major_achievements, revenue,
            key_performance_indicators, funding_rounds, website
     FROM business_profiles WHERE user_id = $1`,
    [userId]
  );
  if (result.rows.length === 0) return;

  const profile = result.rows[0];
  const labels: [string, string][] = [
    ['Business name', profile.business_name],
    ['Mission', profile.mission_statement],
    ['Vision', profile.vision_statement],
    ['Main offerings', profile.description_main_offerings],
    ['Key features/benefits', profile.key_features_or_benefits],
    ['USP', profile.unique_selling_proposition],
    ['Pricing model', profile.pricing_model],
    ['Customer segments', profile.customer_segments],
    ['Geographic focus', profile.geographic_focus],
    ['Industry served', profile.industry_served],
    ['What differentiates', profile.what_differentiates],
    ['Market niche', profile.market_niche],
    ['Revenue streams', profile.revenue_streams],
    ['Distribution channels', profile.distribution_channels],
    ['Key personnel', profile.key_personnel],
    ['Major achievements', profile.major_achievements],
    ['Revenue', profile.revenue],
    ['KPIs', profile.key_performance_indicators],
    ['Funding', profile.funding_rounds],
    ['Website', profile.website],
  ];

  const profileText = labels
    .filter(([, v]) => v && String(v).trim())
    .map(([label, value]) => `${label}: ${String(value).trim()}`)
    .join('\n');

  if (!profileText) return;

  const chunks = chunkText(profileText);
  if (chunks.length === 0) return;

  const embeddings = await embedTexts(chunks);

  await pool.query(
    `DELETE FROM knowledge_chunks WHERE user_id = $1 AND source_type = 'business_profile'`,
    [userId]
  );

  const insertValues: string[] = [];
  const insertParams: any[] = [];
  let paramIdx = 1;

  for (let i = 0; i < chunks.length; i++) {
    const hash = sha256(chunks[i]);
    const embeddingPgArray = `{${embeddings[i].join(',')}}`;
    insertValues.push(
      `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}::float8[], $${paramIdx + 6})`
    );
    insertParams.push(userId, 'business_profile', 'business_profile', chunks[i], i, embeddingPgArray, hash);
    paramIdx += 7;
  }

  if (insertValues.length > 0) {
    await pool.query(
      `INSERT INTO knowledge_chunks (user_id, source_type, source_name, chunk_text, chunk_index, embedding, content_hash)
       VALUES ${insertValues.join(', ')}`,
      insertParams
    );
  }

  console.log(`[EMBED] Indexed ${chunks.length} business profile chunks for user ${userId}`);
}

export async function indexSessionContext(sessionId: string, fields: Record<string, string>): Promise<void> {
  interface ChunkEntry {
    text: string;
    sourceName: string;
    index: number;
  }
  const allChunks: ChunkEntry[] = [];

  for (const [fieldName, value] of Object.entries(fields)) {
    if (!value || !value.trim()) continue;
    const chunks = chunkText(value);
    chunks.forEach((text, idx) => {
      allChunks.push({ text, sourceName: fieldName, index: idx });
    });
  }

  if (allChunks.length === 0) return;

  const embeddings = await embedTexts(allChunks.map(c => c.text));

  await pool.query('DELETE FROM knowledge_chunks WHERE session_id = $1', [sessionId]);

  const insertValues: string[] = [];
  const insertParams: any[] = [];
  let paramIdx = 1;

  for (let i = 0; i < allChunks.length; i++) {
    const chunk = allChunks[i];
    const embedding = embeddings[i];
    const hash = sha256(chunk.text);
    const embeddingPgArray = `{${embedding.join(',')}}`;
    insertValues.push(
      `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4}, $${paramIdx + 5}::float8[], $${paramIdx + 6})`
    );
    insertParams.push(sessionId, 'session_context', chunk.sourceName, chunk.text, chunk.index, embeddingPgArray, hash);
    paramIdx += 7;
  }

  if (insertValues.length > 0) {
    await pool.query(
      `INSERT INTO knowledge_chunks (session_id, source_type, source_name, chunk_text, chunk_index, embedding, content_hash)
       VALUES ${insertValues.join(', ')}`,
      insertParams
    );
  }

  console.log(`[EMBED] Indexed ${allChunks.length} session context chunks for session ${sessionId}`);
}

export interface RetrievedChunk {
  text: string;
  source_type: string;
  source_name: string;
  score: number;
}

/** Per-document cap when loading full text into the agent (characters). */
export const MAX_FULL_DOCUMENT_CHARS = 120_000;

function truncateFullDocument(text: string, maxChars = MAX_FULL_DOCUMENT_CHARS): string {
  const t = (text || '').trim();
  if (!t) return '';
  return t.length > maxChars ? `${t.slice(0, maxChars)}\n\n...[truncated]` : t;
}

function formatBusinessProfileRow(profile: Record<string, unknown>): string {
  const labels: [string, string][] = [
    ['Business name', 'business_name'],
    ['Mission', 'mission_statement'],
    ['Vision', 'vision_statement'],
    ['Main offerings', 'description_main_offerings'],
    ['Key features/benefits', 'key_features_or_benefits'],
    ['USP', 'unique_selling_proposition'],
    ['Pricing model', 'pricing_model'],
    ['Customer segments', 'customer_segments'],
    ['Geographic focus', 'geographic_focus'],
    ['Industry served', 'industry_served'],
    ['What differentiates', 'what_differentiates'],
    ['Market niche', 'market_niche'],
    ['Revenue streams', 'revenue_streams'],
    ['Distribution channels', 'distribution_channels'],
    ['Key personnel', 'key_personnel'],
    ['Major achievements', 'major_achievements'],
    ['Revenue', 'revenue'],
    ['KPIs', 'key_performance_indicators'],
    ['Funding', 'funding_rounds'],
    ['Website', 'website'],
  ];
  const lines: string[] = [];
  for (const [label, key] of labels) {
    const v = profile[key];
    if (v != null && String(v).trim()) lines.push(`${label}: ${String(v).trim()}`);
  }
  return lines.join('\n');
}

/**
 * Load complete knowledge sources for the agent (no vector search).
 * Each item is one logical document with a clear title in `source_name`.
 */
export async function loadFullKnowledgeDocuments(
  personaIds: string[],
  sessionId?: string,
  userId?: string
): Promise<RetrievedChunk[]> {
  const out: RetrievedChunk[] = [];
  const seenKeys = new Set<string>();

  const push = (source_type: string, source_name: string, text: string) => {
    const body = truncateFullDocument(text);
    if (!body.trim()) return;
    const key = `${source_type}:${source_name}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    out.push({ source_type, source_name, text: body, score: 1 });
  };

  const uniquePersonaIds = [...new Set(personaIds.filter(Boolean))];
  for (const pid of uniquePersonaIds) {
    const pr = await pool.query('SELECT id, name, description FROM personas WHERE id = $1', [pid]);
    if (pr.rows.length === 0) continue;
    const { name, description } = pr.rows[0] as { name: string; description: string | null };
    const profileText = description?.trim() ? `Name: ${name}\n\n${description}` : `Name: ${name}`;
    push('full_persona_profile', `Persona profile — ${name} (name & description)`, profileText);

    const files = await pool.query(
      'SELECT name, content FROM persona_files WHERE persona_id = $1 ORDER BY name ASC',
      [pid]
    );
    for (const f of files.rows as { name: string; content: string | null }[]) {
      if (f.content && String(f.content).trim()) {
        push(
          'full_persona_file',
          `Blueprint file — ${name} / ${f.name}`,
          String(f.content)
        );
      }
    }
  }

  if (sessionId) {
    const sr = await pool.query(
      `SELECT source_name, chunk_text, chunk_index FROM knowledge_chunks
       WHERE session_id = $1 AND source_type = 'session_context'
       ORDER BY source_name ASC, chunk_index ASC`,
      [sessionId]
    );
    const byField = new Map<string, string[]>();
    for (const row of sr.rows as { source_name: string; chunk_text: string }[]) {
      const field = row.source_name || 'context';
      if (!byField.has(field)) byField.set(field, []);
      byField.get(field)!.push(row.chunk_text);
    }
    for (const [fieldName, parts] of byField) {
      push(
        'full_session_field',
        `Simulation session input — ${fieldName}`,
        parts.join('\n\n')
      );
    }
  }

  if (userId) {
    const br = await pool.query(
      `SELECT business_name, mission_statement, vision_statement, description_main_offerings,
              key_features_or_benefits, unique_selling_proposition, pricing_model, customer_segments,
              geographic_focus, industry_served, what_differentiates, market_niche, revenue_streams,
              distribution_channels, key_personnel, major_achievements, revenue,
              key_performance_indicators, funding_rounds, website
       FROM business_profiles WHERE user_id = $1`,
      [userId]
    );
    if (br.rows.length > 0) {
      const profileText = formatBusinessProfileRow(br.rows[0] as Record<string, unknown>);
      if (profileText.trim()) {
        push(
          'full_business_profile',
          "Runner's business profile — client company (from simulation runner, not the persona)",
          profileText
        );
      }
    }
  }

  return out;
}

export async function retrieve(
  query: string,
  personaIds: string[],
  sessionId?: string,
  topK = 10,
  userId?: string
): Promise<RetrievedChunk[]> {
  const [queryEmbedding] = await embedTexts([query]);

  const conditions: string[] = [];
  const params: any[] = [];
  let paramIdx = 1;

  if (personaIds.length > 0) {
    conditions.push(`persona_id = ANY($${paramIdx})`);
    params.push(personaIds);
    paramIdx++;
  }
  if (sessionId) {
    conditions.push(`session_id = $${paramIdx}`);
    params.push(sessionId);
    paramIdx++;
  }
  if (userId) {
    conditions.push(`user_id = $${paramIdx}`);
    params.push(userId);
    paramIdx++;
  }

  if (conditions.length === 0) return [];

  const whereClause = conditions.join(' OR ');
  const result = await pool.query(
    `SELECT chunk_text, source_type, source_name, embedding FROM knowledge_chunks WHERE ${whereClause}`,
    params
  );

  const scored = result.rows
    .filter((row: any) => row.embedding && (Array.isArray(row.embedding) ? row.embedding.length > 0 : typeof row.embedding === 'string' && row.embedding.length > 2))
    .map((row: any) => {
      let embedding: number[];
      if (Array.isArray(row.embedding)) {
        embedding = row.embedding.map(Number);
      } else if (typeof row.embedding === 'string') {
        const cleaned = row.embedding.replace(/^\{/, '[').replace(/\}$/, ']');
        embedding = JSON.parse(cleaned);
      } else {
        return null;
      }
      return {
        text: row.chunk_text,
        source_type: row.source_type,
        source_name: row.source_name,
        score: cosineSimilarity(queryEmbedding, embedding),
      };
    })
    .filter(Boolean) as { text: string; source_type: string; source_name: string; score: number }[];

  scored.sort((a: RetrievedChunk, b: RetrievedChunk) => b.score - a.score);
  return scored.slice(0, topK);
}
