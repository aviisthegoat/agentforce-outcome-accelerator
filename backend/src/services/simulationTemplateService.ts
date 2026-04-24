import pool from '../config/database.js';
import { SimulationTemplate, CreateSimulationRequest, UpdateSimulationRequest } from '../types/index.js';
import { v4 as uuidv4 } from 'uuid';

/** Per-type description of expected output and behavior; used when generating the system prompt. */
const SIMULATION_TYPE_OUTPUT_SPECS: Record<string, string> = {
  report: `Strict output: A single downloadable report from the {{SELECTED_PROFILE_FULL}} perspective. Exactly one paragraph of reasoning (or summary), then the full report in a structured/column format. No chat. No follow-up. Read-only output only.`,
  persuasion_simulation: `Strict output: Back-and-forth chat. At the end, the persona MUST state exactly one line: 'Persuasion: N%' where N is an integer from 1 to 100 indicating how persuaded the agent is. Example: 'Persuasion: 75%'. The score must be convincing and between 1-100. The UI displays this as the persuasion result. No other structured output—conversation plus this final line.`,
  response_simulation: `Strict output: Exactly one response. Must include: (1) the confidence level (e.g. percentage or score), (2) the single output—for numeric type always give a number AND its unit (e.g. "45 minutes", "$1,200", "75%"); for action/text give the chosen action or text answer—and (3) at most one paragraph of reasoning. No chat. No further interaction.`,
  survey: `Strict output: Survey results only. Persona answers the survey in the given context; prebuilt or generated surveys are allowed. Output is survey responses (suitable for CSV export) and optionally a short summary/bullets. No chat. No follow-up conversation.`,
  persona_conversation: `Moderated multi-persona conversation. Multiple personas discuss an opening line in turns; an LLM moderator decides who speaks next and when the conversation ends. Each persona responds in a separate call with full conversation context. After the conversation (or after max 20 persona turns), the moderator summarizes and answers the opening line. No user chat—conversation is persona-to-persona only.`,
  idea_generation: `Strict output: Exactly one response. Output MUST be a bullet list of ideas only (use "- " or "* " at the start of each line). No introductory paragraph, no chat, no follow-up. The number of ideas is specified in the configuration; output exactly that many bullet points.`,
};

function parseJsonField(val: unknown): any[] | Record<string, unknown> | undefined {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(val) || (typeof val === 'object' && val !== null)) return val as any;
  return undefined;
}

function mapRowToTemplate(row: any): SimulationTemplate {
  const requiredInputFields = parseJsonField(row.required_input_fields) ?? [];
  const allowedPersonaTypes = parseJsonField(row.allowed_persona_types);
  const typeSpecificConfig = parseJsonField(row.type_specific_config);
  return {
    id: row.id,
    title: row.title,
    description: row.description || undefined,
    icon: row.icon || undefined,
    required_input_fields: Array.isArray(requiredInputFields) ? requiredInputFields : [],
    system_prompt: row.system_prompt,
    is_active: row.is_active !== undefined ? row.is_active : true,
    simulation_type: row.simulation_type || undefined,
    allowed_persona_types: Array.isArray(allowedPersonaTypes) ? allowedPersonaTypes as any : undefined,
    persona_count_min: row.persona_count_min != null ? Number(row.persona_count_min) : undefined,
    persona_count_max: row.persona_count_max != null ? Number(row.persona_count_max) : undefined,
    type_specific_config: typeSpecificConfig && typeof typeSpecificConfig === 'object' && !Array.isArray(typeSpecificConfig) ? typeSpecificConfig : undefined,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
  };
}

export async function getAllSimulations(includeInactive: boolean = false): Promise<SimulationTemplate[]> {
  try {
    let query = 'SELECT * FROM simulations';
    const params: any[] = [];

    if (!includeInactive) {
      query += ' WHERE is_active = TRUE';
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    return result.rows.map(row => mapRowToTemplate(row));
  } catch (error: any) {
    console.error('Error in getAllSimulations:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
    });
    throw error;
  }
}

export async function getSimulationById(id: string): Promise<SimulationTemplate | null> {
  const result = await pool.query(
    'SELECT * FROM simulations WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const sim = result.rows[0];
  return mapRowToTemplate(sim);
}

export async function createSimulation(data: CreateSimulationRequest): Promise<SimulationTemplate> {
  const id = uuidv4();
  const systemPrompt = data.system_prompt?.trim()
    ? data.system_prompt.trim()
    : buildSystemPromptFromConfig(data);
  const result = await pool.query(
    `INSERT INTO simulations (id, title, description, icon, required_input_fields, system_prompt, is_active, simulation_type, allowed_persona_types, persona_count_min, persona_count_max, type_specific_config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      id,
      data.title,
      data.description || null,
      data.icon || null,
      JSON.stringify(data.required_input_fields || []),
      systemPrompt,
      data.is_active !== undefined ? data.is_active : true,
      data.simulation_type || 'report',
      JSON.stringify(data.allowed_persona_types ?? ['synthetic_user', 'advisor']),
      data.persona_count_min ?? 1,
      data.persona_count_max ?? 1,
      JSON.stringify(data.type_specific_config ?? {}),
    ]
  );

  const sim = result.rows[0];
  return mapRowToTemplate(sim);
}

export function buildSystemPromptFromConfig(data: CreateSimulationRequest): string {
  const desc = data.description?.trim() || 'No description provided.';
  const type = data.simulation_type || 'report';
  const config = data.type_specific_config || {};
  const lines: string[] = [
    `You are running a ${type} simulation.`,
    '',
    '### CRITICAL — How to respond',
    'You ARE the persona. Every response must be in first person as that persona, based on the profile and inputs. Never describe, reference, or embed the persona in your reply (e.g. no "As this persona...", "The synthetic user would...", or meta-commentary about the persona). Answer as if you were the persona—speak only as them.',
    '',
    '### What this simulation is',
    desc,
    '',
    '### Variables you can use',
    '- {{SELECTED_PROFILE}} - Name of the selected persona (defines **who** is responding)',
    '- {{SELECTED_PROFILE_FULL}} - Full profile and blueprint of the persona',
    '- {{BACKGROUND_INFO}} - Background context from the **person running the simulation** (the user), not the persona',
    '',
    '**Inputs vs persona:** Only {{SELECTED_PROFILE}} and {{SELECTED_PROFILE_FULL}} define the persona (the synthetic character). All other variables above and in "User input variables" below are **input from the person running the simulation** (the user/client)—e.g. their business background, context, opening line—not the persona\'s. The persona responds using their profile and the user\'s inputs.',
    '',
  ];

  const requiredFields = data.required_input_fields;
  if (requiredFields && Array.isArray(requiredFields) && requiredFields.length > 0) {
    lines.push('### User input variables');
    lines.push('At runtime the following placeholders will be replaced with **the person running the simulation\'s (the user\'s) input**. This is the user\'s context, business background, opening line, etc.—not the persona\'s. Include all of them when relevant:');
    for (const field of requiredFields) {
      const placeholder = `{{${(field.name || '').toUpperCase()}}}`;
      const typeLabel = field.type || 'text';
      const opts = field.type === 'multiple_choice' && field.options?.length
        ? ' Options: ' + field.options.filter(Boolean).join(', ')
        : '';
      lines.push(`- ${placeholder} - [${typeLabel}] ${field.name}${opts}`);
    }
    lines.push('');

    lines.push('### Focus of this simulation');
    lines.push('The **focus** of your response is always the **user\'s inputs**—the content that replaces the variables above (e.g. {{BACKGROUND_INFO}}, {{OPENING_LINE}}, and any other placeholders such as {{BUSINESSPROFILE}}). Your persona ({{SELECTED_PROFILE_FULL}}) is in the **background**: use your profile to inform your perspective and assist in decision-making, but center your analysis, recommendations, and conversation on the **user\'s situation and inputs**. Do not center the response on your own organization, story, or context unless it directly serves the user\'s request.');
    lines.push('');

    const hasBusinessProfileField = requiredFields.some(
      (f) => f.type === 'business_profile' || f.name === 'businessProfile'
    );
    if (hasBusinessProfileField) {
      lines.push('### Business to analyze (client company)');
      lines.push('The {{BUSINESSPROFILE}} variable contains the **client\'s (user\'s) business**—the company you are advising or analyzing. Your own identity and expertise are defined in {{SELECTED_PROFILE_FULL}}. You must base your analysis (e.g. SWOT, recommendations, report) exclusively on the business described in {{BUSINESSPROFILE}}, not on your own organization or any other company.');
      lines.push('');
    }
  }

  const typeSpec = SIMULATION_TYPE_OUTPUT_SPECS[type];
  if (typeSpec) {
    lines.push('### Expected output and behavior');
    lines.push(typeSpec);
    lines.push('');
  }

  if (type === 'persuasion_simulation') {
    const decisionPoint = (config.decision_point as string)?.trim();
    const decisionCriteria = (config.decision_criteria as string)?.trim();
    if (decisionPoint) lines.push('### Decision point\n' + decisionPoint + '\n');
    if (decisionCriteria) lines.push('### Decision criteria (evaluate the persona\'s decision using)\n' + decisionCriteria + '\n');
  }

  if (type === 'report') {
    const reportStructure = (config.report_structure as string)?.trim();
    if (reportStructure) lines.push('### Report structure\n' + reportStructure + '\n');
    const exampleFileName = (config.report_example_file_name as string)?.trim();
    if (exampleFileName) {
      lines.push('### Example/reference document');
      lines.push('Filename: ' + exampleFileName);
      lines.push('(Content is stored and can be used as reference for the report.)\n');
    }
  }

  if (type === 'survey') {
    const surveyMode = (config.survey_mode as string) || 'generated';
    lines.push('### Survey mode: ' + surveyMode + '\n');
    if (surveyMode === 'generated') {
      const purpose = (config.survey_purpose as string)?.trim();
      if (purpose) lines.push('### Survey purpose\n' + purpose + '\n');
      const questions = config.survey_questions as Array<{ type: string; question: string; options?: string[] }> | undefined;
      if (questions?.length) {
        lines.push('### Survey questions (in order)');
        questions.forEach((q, i) => {
          lines.push(`${i + 1}. [${q.type}] ${q.question}`);
          if (q.type === 'multiple_choice' && q.options?.length) lines.push('   Options: ' + q.options.filter(Boolean).join(', '));
        });
        lines.push('');
      }
    }
  }

  if (type === 'response_simulation') {
    const decisionType = (config.decision_type as string) || 'numeric';
    lines.push('### Decision type: ' + decisionType + '\n');
    if (decisionType === 'numeric') {
      const unit = (config.unit as string)?.trim();
      if (unit) {
        lines.push('### Unit (required for numeric output)');
        lines.push(`The numeric answer MUST be expressed as: [number] ${unit}`);
        lines.push('Example: "30 minutes", "€500", "85%". Always include the unit in your response.\n');
      }
    }
    if (decisionType === 'action') {
      const actionOptions = (config.action_options as string)?.trim();
      if (actionOptions) lines.push('### Possible outputs (comma-separated)\n' + actionOptions + '\n');
    }
  }

  if (type === 'idea_generation') {
    const numIdeas = typeof config.num_ideas === 'number' && config.num_ideas >= 1 ? config.num_ideas : 5;
    lines.push('### Number of ideas');
    lines.push(`You MUST output exactly ${numIdeas} ideas. Each idea must be a single bullet point (start each line with "- " or "* "). No other text—only the bullet list of ideas.\n`);
  }

  // Optional: add any type_specific_config keys not already rendered above (so we avoid duplicating)
  const alreadyRenderedKeys = new Set<string>();
  if (type === 'persuasion_simulation') {
    alreadyRenderedKeys.add('decision_point');
    alreadyRenderedKeys.add('decision_criteria');
  }
  if (type === 'report') {
    alreadyRenderedKeys.add('report_structure');
    alreadyRenderedKeys.add('report_example_file_name');
  }
  if (type === 'survey') {
    alreadyRenderedKeys.add('survey_mode');
    alreadyRenderedKeys.add('survey_purpose');
    alreadyRenderedKeys.add('survey_questions');
  }
  if (type === 'response_simulation') {
    alreadyRenderedKeys.add('decision_type');
    alreadyRenderedKeys.add('unit');
    alreadyRenderedKeys.add('action_options');
  }
  if (type === 'idea_generation') {
    alreadyRenderedKeys.add('num_ideas');
  }
  const extraConfig: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (!alreadyRenderedKeys.has(k) && v !== undefined && v !== null && v !== '') {
      extraConfig[k] = v;
    }
  }
  if (Object.keys(extraConfig).length > 0) {
    lines.push('');
    lines.push('### Additional config');
    lines.push(JSON.stringify(extraConfig));
    lines.push('');
  }

  lines.push('You ARE the persona. Stay in character and use the profile and inputs to respond. Never describe or reference the persona from outside—answer only as the persona, in first person.');

  return lines.join('\n');
}

export async function updateSimulation(id: string, data: UpdateSimulationRequest): Promise<SimulationTemplate | null> {
  const fields: string[] = [];
  const values: any[] = [];
  let paramCount = 1;

  if (data.title !== undefined) {
    fields.push(`title = $${paramCount++}`);
    values.push(data.title);
  }
  if (data.description !== undefined) {
    fields.push(`description = $${paramCount++}`);
    values.push(data.description);
  }
  if (data.icon !== undefined) {
    fields.push(`icon = $${paramCount++}`);
    values.push(data.icon);
  }
  if (data.required_input_fields !== undefined) {
    fields.push(`required_input_fields = $${paramCount++}`);
    values.push(JSON.stringify(data.required_input_fields));
  }
  if (data.system_prompt !== undefined) {
    fields.push(`system_prompt = $${paramCount++}`);
    values.push(data.system_prompt);
  }
  if (data.is_active !== undefined) {
    fields.push(`is_active = $${paramCount++}`);
    values.push(data.is_active);
  }
  if (data.simulation_type !== undefined) {
    fields.push(`simulation_type = $${paramCount++}`);
    values.push(data.simulation_type);
  }
  if (data.allowed_persona_types !== undefined) {
    fields.push(`allowed_persona_types = $${paramCount++}`);
    values.push(JSON.stringify(data.allowed_persona_types));
  }
  if (data.persona_count_min !== undefined) {
    fields.push(`persona_count_min = $${paramCount++}`);
    values.push(data.persona_count_min);
  }
  if (data.persona_count_max !== undefined) {
    fields.push(`persona_count_max = $${paramCount++}`);
    values.push(data.persona_count_max);
  }
  if (data.type_specific_config !== undefined) {
    fields.push(`type_specific_config = $${paramCount++}`);
    values.push(JSON.stringify(data.type_specific_config));
  }

  if (fields.length === 0) {
    return getSimulationById(id);
  }

  fields.push(`updated_at = CURRENT_TIMESTAMP`);
  values.push(id);

  const result = await pool.query(
    `UPDATE simulations
     SET ${fields.join(', ')}
     WHERE id = $${paramCount}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return null;
  }

  const sim = result.rows[0];
  return mapRowToTemplate(sim);
}

export async function deleteSimulation(id: string): Promise<boolean> {
  const result = await pool.query(
    'DELETE FROM simulations WHERE id = $1',
    [id]
  );

  return result.rowCount !== null && result.rowCount > 0;
}

