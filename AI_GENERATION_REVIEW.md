# AI Generation Inventory — Inputs, Expected Outputs & Prompts for Review

Every **Google Gemini** AI touchpoint in this codebase: what goes in, what should come out, the prompt, and questions for human review.

**Primary implementation files**

| Layer | File | API key | Default model |
|-------|------|---------|---------------|
| Frontend (browser) | `src/services/gemini.ts` | `VITE_GEMINI_API_KEY` / `GEMINI_API_KEY` | `gemini-2.5-flash` |
| Backend agent pipeline | `backend/src/services/agentService.ts` | `GEMINI_API_KEY` (server) | `gemini-2.5-flash` |
| Backend embeddings | `backend/src/services/embeddingService.ts` | `GEMINI_API_KEY` (server) | `gemini-embedding-001` |
| Legacy (unused root) | `services/gemini.ts` | `process.env.API_KEY` | `gemini-1.5-flash` / `gemini-2.5-flash-image` / `gemini-3-pro-preview` |

---

## Table of Contents

1. [Frontend generic helpers](#1-frontend-generic-helpers)
2. [Persona building — Synthetic Users](#2-persona-building--synthetic-users)
3. [Persona building — Advisors (LinkedIn)](#3-persona-building--advisors-linkedin)
4. [Persona building — Advisors (Document upload)](#4-persona-building--advisors-document-upload)
5. [Persona name generation](#5-persona-name-generation)
6. [Avatar generation](#6-avatar-generation)
7. [Business profile extraction](#7-business-profile-extraction-from-document)
8. [Simulation template authoring](#8-simulation-template-authoring)
9. [Simulation type configurations](#9-simulation-type-configurations--type_specific_config-fields)
10. [Simulation runtime — frontend moderators & scoring](#10-simulation-runtime--frontend-moderators--scoring)
11. [Backend agent pipeline (Think → Respond → Validate)](#11-backend-agent-pipeline-think--respond--validate)
12. [Backend embeddings & knowledge indexing](#12-backend-embeddings--knowledge-indexing)
13. [Backend admin AI endpoints](#13-backend-admin-ai-endpoints)
14. [Seed / legacy simulations](#14-seed--legacy-simulations)
15. [Templates catalog](#15-templates-catalog)
16. [Legacy / dead paths](#16-legacy--dead-paths)
17. [Global review checklist](#17-global-review-checklist)

---

## 1. Frontend generic helpers

> File: `src/services/gemini.ts`

### 1.1 `generateBasic(prompt, isJson?)`

| Item | Detail |
|------|--------|
| **Inputs** | `prompt` string (truncated to 500k chars); `isJson` flag |
| **Expected output** | Plain text; when `isJson === true`, first `{…}` JSON block is extracted and parsed |
| **Model** | `gemini-2.5-flash` |
| **Prompt** | Caller-supplied only — no fixed system wrapper |
| **Review** | Should `responseMimeType: 'application/json'` be enforced for JSON callers to prevent markdown fences? |

### 1.2 `extractFacts(sourceData)`

| Item | Detail |
|------|--------|
| **Inputs** | Raw text (truncated to 50k chars), e.g. pasted LinkedIn content |
| **Expected output** | Bullet-style fact list: name, title, companies, achievements, skills, education, tone |
| **Model** | `gemini-2.5-flash` |
| **Prompt** | `TASK: Extract every specific professional fact from the following text. SOURCE: ${sourceData}. EXTRACT: Full Name and Current Title, Exact companies and years worked, Specific projects or achievements, Key skills and technologies, Educational background, Tone of voice. RULES: If the source is just a URL, state "NO TEXT DATA PROVIDED - ONLY A LINK". Only list facts present. Do not hallucinate.` |
| **Review** | If the user pastes a short URL instead of profile text, does "NO TEXT DATA" propagate gracefully into the persona or error out? |

### 1.3 `runSimulation(prompt, imageData?, mimeType?)`

| Item | Detail |
|------|--------|
| **Inputs** | Text prompt + optional base64 inline file (any `GEMINI_ACCEPTED_MIME_TYPES`: png, jpeg, webp, gif, heic, pdf, docx, doc, txt, csv, json) |
| **Expected output** | Free-form text (extraction, analysis, or simulation response) |
| **Model** | `gemini-2.5-flash` with retry on 503/502/504 |
| **Prompt** | Caller-supplied; parts = `[{ text }, { inlineData }]` when file present |
| **Review** | Are extraction word limits enforced downstream? File validation checks length ≥ 100 base64 chars and regex `/^[A-Za-z0-9+/=]+$/`. |

### 1.4 `chat(systemPrompt, history, newMessage)`

| Item | Detail |
|------|--------|
| **Inputs** | System instruction (truncated to 200k); history array of `{role, text}` (each truncated to 20k); new user message (truncated to 20k) |
| **Expected output** | Plain text in-character reply |
| **Model** | `gemini-2.5-flash` with retry on 503/502/504 |
| **Prompt** | Caller-supplied `systemPrompt` as `config.systemInstruction` |
| **Review** | Used by legacy `pages/ChatPage.tsx` and `pages/SimulationPage.tsx`. The main app `src/views/ChatPage.tsx` uses `agentApi.turnStream` instead (backend pipeline). |

### 1.5 `generateChain(templateContent, inputs, useExtendedThinking?, temperature?)`

| Item | Detail |
|------|--------|
| **Inputs** | Markdown template string; `inputs` key→value map rendered as `### SOURCE DATA [key]:` blocks (values truncated to 100k each); optional `temperature` override |
| **Expected output** | Full Markdown document filling the template from source data only |
| **Model** | `gemini-2.5-flash` (always, despite `useExtendedThinking` param being passed — the current `src/services/gemini.ts` ignores it and uses flash) |
| **Prompt** | `ROLE: High-Fidelity Persona Architect. STRICT REQUIREMENT: persona based ON THE PROVIDED SOURCE DATA ONLY. Capture specific career path, actual companies, unique personality traits. DO NOT USE GENERIC ADVICE OR "PLACEHOLDER" CORPORATE SPEAK. TEMPLATE TO FILL: ${templateContent}. RAW SOURCE DATA: ${contextString}. INSTRUCTIONS: 1. Map specific professional history. 2. If missing, leave minimal. 3. Capture 'Voice'. 4. Output full Markdown.` |
| **Review** | Is "minimal rather than inventing" strong enough to prevent hallucination? Does the template actually get filled properly for all 7 templates? |

---

## 2. Persona building — Synthetic Users

> File: `src/views/BuildPersonaPage.tsx` — `SyntheticUserForm`, method `problem_solution`, `supporting_docs`, or `business_profile`

### Build modes

| Mode | User inputs |
|------|------------|
| `problem_solution` | Problem, Solution, Differentiator, Existing alternatives, B2B/B2C context |
| `supporting_docs` | Uploaded text document |
| `business_profile` | Saved business profile from Settings + optional specific user type |

### Chain of AI calls (all modes converge)

| Step | Function | Template / Prompt | Inputs | Expected output |
|------|----------|-------------------|--------|-----------------|
| 1. Market Canvas | `generateChain` | `marketCanvasTemplate` | `{ "Strategic Input": userQInputs }` | Filled market canvas Markdown |
| 2. Job Architecture | `generateChain` | `jobBuilderTemplate` | `{ "Strategic Analysis": marketCanvas }` | Filled job builder Markdown |
| 3. Success Metrics | `generateChain` | `metricsTemplate` | `{ "Context": marketCanvas, "Jobs": jobBuilder }` | Filled metrics Markdown |
| 4. Identity extraction | `generateBasic(idPrompt, true)` | `"Identify N distinct personas from this analysis. For each persona return a real-sounding human name in "name" and their job/role title in "title". CRITICAL: Each persona must have a unique full name. Return JSON: { "personas": [{ "name": string, "title": string }] }. Analysis: ${marketCanvas}"` | N = `formData.q7` (persona count) | JSON `{ personas: [{ name, title }] }` |
| 5. Name uniqueness | `generatePersonaName(titleStr, usedNames)` | See §5 | Role + used names (note: 2nd arg is ignored) | `"First Last"` string |
| 6. Detailed profile | `generateChain` | `agentProfileDetailedTemplate` | `{ "Target Persona Name": name, "Reference Analysis": marketCanvas + jobBuilder + metrics }` + `temperature` | 10-point agent profile Markdown |
| 7. Behaviors | `generateChain` | `agentBehaviorsTemplate` | `{ "Agent Profile": profile, "Reference Analysis": marketCanvas }` + `temperature` | Agent behaviors Markdown |
| 8. Avatar | `generateAvatar(name, title)` | See §6 | Name + title | Image data URL or fallback |

**Review:** Does the three-step chain (canvas → jobs → metrics) over-constrain diversity? Are invented names compliant with DEI guidelines? The `temperature` param is passed to `generateChain` — does the default provide enough variation across multiple personas?

---

## 3. Persona building — Advisors (LinkedIn)

> File: `src/views/BuildPersonaPage.tsx` — `AdvisorForm`, `sourceMode === 'linkedin'`

| Step | Function | Inputs | Expected output |
|------|----------|--------|-----------------|
| 1. Fact extraction | `extractFacts(linkedinText)` | Pasted LinkedIn profile text | Bullet-style professional facts |
| 2. Optional doc extraction | `runSimulation(extractPrompt, base64, mime)` | `"Extract the key text content from this document (CV, portfolio, or similar). Focus on: professional background, roles, achievements, skills, career-related content. Return plain text, concise but comprehensive (max ~8000 words)."` + file | Plain text extraction |
| 3. Identity | `generateBasic(idPrompt, true)` | `"Identify the specific professional from these facts. Return JSON: { "name": string, "title": string, "summary": string }. Facts: ${extractedFacts.substring(0, 2000)}"` | JSON `{ name, title, summary }` |
| 4. Name fallback | `generatePersonaName('professional advisor')` | Context string | `"First Last"` |
| 5. Blueprint | `generateChain(highFidelityPersonaTemplate, { "Fact Extraction": extractedFacts, "Raw LinkedIn Content": linkedinText, "Other Docs": otherDocsResolved, "Primary Source Material": combined, "Identity Target": name+title, "Context Summary": summary, "Target Name": name }, true)` | All extracted material + template | High-fidelity persona Markdown |
| 6. Avatar | `generateAvatar(name, title)` | Name + title | Image or fallback |

**Review:** Identity uses only `extractedFacts.substring(0, 2000)` — is that truncation losing critical disambiguation when facts run long? Should `combined` material (with other docs) inform identity?

---

## 4. Persona building — Advisors (Document upload)

> File: `src/views/BuildPersonaPage.tsx` — `AdvisorForm`, `sourceMode !== 'linkedin'`

| Step | Function | Inputs | Expected output |
|------|----------|--------|-----------------|
| 1. Document extraction | `runSimulation(extractPrompt, fileBase64, fileMimeType)` | `"Extract the key text content from this document. Focus on: 1. Author/expert name and credentials 2. Main concepts, theories, and key insights 3. Important quotes or passages 4. Summary of the content (limit to ~8000 words maximum). Return the extracted text in a structured format."` + file | Structured text extraction |
| 2. Identity | `generateBasic(idPrompt, true)` | `"Analyze this text and identify the primary author/expert. Return JSON: { "name": string, "title": string, "summary": string }. Text sample: ${extractedText.substring(0, 8000)}"` | JSON `{ name, title, summary }` |
| 3. Name fallback | `generatePersonaName('professional advisor')` | Context string | `"First Last"` |
| 4. Blueprint | `generateChain(highFidelityPersonaTemplate, { "Primary Source Material": limitedSourceMaterial, "Identity Target": name+title, "Context Summary": summary }, true)` | Template + source material (capped at 30k chars) | High-fidelity persona Markdown |
| 5. Avatar | `generateAvatar(name, title)` | Name + title | Image or fallback |

**Review:** Is "structured format" for extraction consistently parseable? Should the 8k char identity window be larger for academic/book-length material?

---

## 5. Persona name generation

> Function: `geminiService.generatePersonaName(context)` — `src/services/gemini.ts`

| Item | Detail |
|------|--------|
| **Inputs** | `context` string (role description). *Note: some callers pass a second argument `usedNames` but the function signature only accepts `context: string` — the second argument is silently ignored.* |
| **Expected output** | JSON `{"name": "First Last"}` → extracted to string; fallback `"Persona"` |
| **Prompt** | `"Generate a plausible, invented full name (first and last name only) for a person who might have this role. Return only valid JSON: {"name": "First Last"}. The value for "name" must be a real-sounding human name (e.g. "Sarah Chen", "Marcus Webb"), never a job title or role (e.g. not "Project Lead", "Marketing Director", or "Advisor"). Context/role: ${context}"` |
| **Review** | Should the model explicitly avoid names of real public figures? Should deduplication be implemented in the function using the second argument? |

---

## 6. Avatar generation

> Function: `geminiService.generateAvatar(name, title)` — `src/services/gemini.ts`

| Item | Detail |
|------|--------|
| **Inputs** | `name` (persona full name); `title` (role/job title) |
| **Expected output** | `data:image/png;base64,...` inline image; fallback to `ui-avatars.com` URL |
| **Model** | `gemini-2.5-flash` with `imageConfig.aspectRatio: "1:1"` |
| **Prompt** | `"A clean, high-quality 2D cartoon face avatar of a ${title} named ${name}. Modern flat design style, friendly professional expression, centered, solid soft-colored background, vibrant colors, simplified features."` |
| **Review** | Does the model reliably return `inlineData` parts? Are avatars diverse and appropriate? Should fallback be a local SVG instead of an external service? |

---

## 7. Business profile extraction from document

> Functions: `geminiService.generateBusinessProfile*` — `src/services/gemini.ts`
> Caller: `src/views/BusinessProfilePage.tsx`

Three **parallel** API calls merge into one profile:

### 7.1 `generateBusinessProfileCompanyOverview`

| Item | Detail |
|------|--------|
| **JSON keys** | `business_name`, `mission_statement`, `vision_statement`, `description_main_offerings`, `key_features_or_benefits`, `unique_selling_proposition`, `pricing_model`, `website` |
| **Prompt** | `"You are an expert at extracting structured business information… TASK: Fill in ONLY the Company Overview section… OUTPUT FORMAT: Respond with a single JSON object only. No markdown, no code fence, no explanation. Use exactly these keys (use null for any missing value)… RULES: Extract and infer from the document; for public companies you may use known facts to fill gaps."` |
| **Optional enrichment** | `companyHint` — `"The user also provided this company identifier: '${hint}'. Use your knowledge of this company to enrich where the document does not specify."` |

### 7.2 `generateBusinessProfileMarketPositioning`

| Item | Detail |
|------|--------|
| **JSON keys** | `customer_segments`, `geographic_focus`, `industry_served`, `what_differentiates`, `market_niche`, `distribution_channels` |
| **Prompt** | Same structure + `"IMPORTANT - Customer Segments: For 'customer_segments', use the following customer profile template structure. Generate 2–4 target customer segments."` Embeds full `customerSegmentTemplate`. |

### 7.3 `generateBusinessProfilePerformanceFunding`

| Item | Detail |
|------|--------|
| **JSON keys** | `key_personnel`, `major_achievements`, `revenue`, `key_performance_indicators`, `funding_rounds`, `revenue_streams` |
| **Prompt** | Same structure; `"for public companies you may use known facts (10-K, news) to fill gaps."` |

**Inputs to all three:** Document text (appended as `DOCUMENT CONTENT:`) or multimodal file (base64 + MIME via `runSimulation`).

**Expected output:** Single flat JSON per call; each value normalized to string or null.

**Wrapper:** `generateBusinessProfileFromDocument` runs all three in `Promise.all` and merges.

**Review:** Is allowing "public company" gap-filling aligned with accuracy policies? Are nulls displayed clearly? Could the JSON include markdown fences despite instructions?

---

## 8. Simulation template authoring

> File: `src/components/SimulationTemplateForm.tsx`

### 8.1 "Improve with AI" (description improvement)

| Item | Detail |
|------|--------|
| **Inputs** | Current `description` text (or empty — model infers from title/type) |
| **Expected output** | Plain text improved description (no markdown, no quotes) |
| **Prompt** | `"You are helping improve a simulation description. The description is used by AI to generate a simulation's system prompt. Improve the following text so it clearly includes: purpose/goal, tone, audience/context, success criteria. Return ONLY the improved description text, nothing else. No preamble, no quotes, no markdown. Plain text only. Current description: ${description}"` |
| **Review** | Does the model add forbidden markdown despite instructions? |

### 8.2 `generateSystemPromptFromConfig` (AI-generated system prompt)

| Item | Detail |
|------|--------|
| **Inputs** | Full `CreateSimulationRequest` JSON (title, description, `simulation_type`, `type_specific_config`, `required_input_fields`, `allowed_persona_types`, persona counts); `icon` stripped before stringify |
| **Expected output** | One system prompt string containing: purpose, behavior instructions, template variables `{{…}}`, mandatory output format for the type |
| **Model** | `gemini-2.5-flash` |
| **Prompt** | Expert meta-prompt (~60 lines): extract intent from config, synthesize prompt, rules for `{{SELECTED_PROFILE}}` vs runner inputs, survey verbatim questions when `survey_mode === 'generated'`, business profile field handling, embedded `SIMULATION_TYPE_OUTPUT_SPECS[simType]`, optional survey question list |
| **Key rules in prompt** | (a) AI must respond ONLY as persona — first person, never meta-commentary. (b) Focus is on runner's inputs, not persona's own org. (c) `{{BUSINESSPROFILE}}` is the client's business. (d) Survey questions must be copied verbatim. (e) Output only the system prompt text. |
| **Fallback** | If Gemini fails, `simulationTemplateApi.previewPrompt` calls backend `buildSystemPromptFromConfig` — deterministic string assembly, no LLM |
| **Review** | After generation, does the admin review UI catch missing `{{FIELD_NAME}}` entries? Are verbatim survey questions preserved? |

### 8.3 Regenerate prompt (review step)

Same as 8.2 but called from the "Regenerate" button in the prompt review UI.

---

## 9. Simulation type configurations & `type_specific_config` fields

### 9.1 `SIMULATION_TYPE_OUTPUT_SPECS`

Duplicated in two files (nearly identical; backend adds "No user chat—conversation is persona-to-persona only" to `persona_conversation`):

| Type ID | Output spec summary |
|---------|-------------------|
| `report` | Single downloadable report: one paragraph of reasoning, then structured report. No chat. |
| `persuasion_simulation` | Back-and-forth chat. Must end with `Persuasion: N%` line (1–100). |
| `response_simulation` | Exactly one response: confidence level + single output (numeric with unit, action, or text) + one paragraph reasoning. |
| `survey` | Survey results only (CSV-suitable) + optional summary. No chat. |
| `persona_conversation` | Moderated multi-persona discussion. LLM moderator picks speakers, decides when to end. Summarizes at end. Max 20 turns. |
| `idea_generation` | Exactly one response: bullet list of N ideas only. No intro, no chat. |

### 9.2 `SIMULATION_TYPES` UI array

> File: `src/components/SimulationTemplateForm.tsx`

| `id` | Label | Icon | Description (UI copy) |
|------|-------|------|-----------------------|
| `report` | Report | `FileText` | A single downloadable report from the persona's perspective: one paragraph of reasoning, then a structured report. No chat or follow-up. |
| `persuasion_simulation` | Persuasion Simulation | `MessageSquare` | Back-and-forth chat where the persona's level of persuasion is tracked. At the end they state a single persuasion percentage (e.g. "Persuasion: 75%"). |
| `response_simulation` | Response Simulation | `Target` | One response only: confidence level, a single output (numeric, action, or text), and up to one paragraph of reasoning. No chat. |
| `survey` | Survey | `BarChart3` | The persona answers survey questions in context. Output is survey responses (e.g. for CSV export) and optionally a short summary. No chat. |
| `persona_conversation` | Persona v Persona Conversation | `Users` | Moderated multi-persona discussion: multiple personas discuss an opening line in turns. An LLM moderator chooses who speaks next and when to end; after the conversation, the moderator summarizes and answers the opening line. Each persona turn is a separate API call; max 20 persona turns. |
| `idea_generation` | Idea Generation | `Lightbulb` | Single response with a fixed number of ideas from the persona's perspective. Output is always a bullet list of ideas. No chat or follow-up. |

### 9.3 `type_specific_config` fields per type

| Type | Config key | UI control | How `buildSystemPromptFromConfig` uses it |
|------|-----------|------------|------------------------------------------|
| **report** | `report_structure` | Textarea | Renders `### Report structure` section |
| | `report_example_file_name` | File upload name | Renders `### Example/reference document` with filename |
| | `report_example_content_base64` | File content (base64) | **Not** in `alreadyRenderedKeys` — falls through to `### Additional config` as raw JSON |
| **persuasion_simulation** | `decision_point` | Textarea | Renders `### Decision point` |
| | `decision_criteria` | Textarea | Renders `### Decision criteria` |
| | `context_label` | Text (optional) | **Not** explicitly rendered — falls through to `### Additional config` JSON |
| **response_simulation** | `decision_type` | Select: `numeric` / `action` / `text` | Renders `### Decision type: ${value}` |
| | `unit` | Text (required if numeric) | Renders `### Unit` with example format |
| | `action_options` | Comma-separated text (if action) | Renders `### Possible outputs` |
| **survey** | `survey_mode` | Select: `generated` / `custom` | Renders `### Survey mode: ${value}` |
| | `survey_purpose` | Textarea (if generated) | Renders `### Survey purpose` |
| | `survey_questions` | Array of `{ type: 'text'|'numeric'|'multiple_choice', question: string, options?: string[] }` (if generated) | Renders numbered `### Survey questions` with types and options |
| **persona_conversation** | `max_persona_turns` | Select: 5–50, default 20 | **No dedicated section** — falls through to `### Additional config` JSON. Runtime enforcement is in frontend moderator logic. |
| **idea_generation** | `num_ideas` | Number: 3–20, default 5 | Renders `### Number of ideas` with `"You MUST output exactly N ideas…"` |

### 9.4 `required_input_fields` (runner inputs at simulation time)

Each simulation template can define input fields the runner fills:

| Field type | Description | Special handling |
|-----------|-------------|-----------------|
| `text` | Single-line text | Replaced as `{{FIELD_NAME}}` in system prompt |
| `textarea` | Multi-line text | Same |
| `multiple_choice` | Dropdown with `options[]` | Same; options listed in prompt |
| `image` | Image upload | Passed as `stimulusImage` inline data |
| `pdf` | Document upload | First `pdf` field with data URL becomes inline attachment |
| `business_profile` | Auto-filled from saved business profile | Replaced with `businessProfileToPromptString(savedProfile)` |
| `survey_questions` | Runner-defined survey questions | Formatted as numbered list with types and options |

### 9.5 `buildSystemPromptFromConfig` (deterministic fallback)

> File: `backend/src/services/simulationTemplateService.ts`

No AI call. Generates a system prompt from config using string concatenation:
1. Opening: `"You are running a ${type} simulation."`
2. Critical persona rules (first person, never meta-comment)
3. `### What this simulation is` (description)
4. `### Variables you can use` (SELECTED_PROFILE, SELECTED_PROFILE_FULL, BACKGROUND_INFO)
5. Inputs vs persona distinction
6. `### User input variables` (from `required_input_fields`)
7. `### Focus of this simulation` (runner's inputs are the focus)
8. `### Business to analyze` (if business_profile field exists)
9. `### Expected output and behavior` (from `SIMULATION_TYPE_OUTPUT_SPECS`)
10. Type-specific sections (see §9.3)
11. `### Additional config` (any leftover keys as JSON)
12. Closing persona instruction

---

## 10. Simulation runtime — frontend moderators & scoring

> File: `src/views/SimulationPage.tsx`, calling `src/services/gemini.ts`

### 10.1 `computePersuasionScore(fullConversation)`

| Item | Detail |
|------|--------|
| **Inputs** | Full conversation text (truncated to 50k chars) |
| **Expected output** | Integer 1–100 parsed from `Persuasion: N%`; fallback 50 |
| **Model** | `gemini-2.5-flash` |
| **Prompt** | `"You are evaluating a persuasion conversation. The "persona" (the agent being persuaded) has been in a back-and-forth dialogue. Based on the conversation below, how persuaded is the persona on a scale of 1 to 100? Consider their stated position, willingness to agree, and any commitments or openness expressed. Conversation: ${fullConversation}. Respond with exactly one line in this format: Persuasion: N% where N is an integer from 1 to 100. No other text."` |
| **Called from** | (a) Loading a persuasion result with no stored score. (b) After batch simulation first persona result. (c) After each follow-up message in persuasion chat. |
| **Review** | Scores may disagree with in-character "Persuasion: N%" lines — are both shown? Is the fallback of 50 appropriate? |

### 10.2 `moderatorWhoSpeaksFirst(openingLine, personas)`

| Item | Detail |
|------|--------|
| **Inputs** | `openingLine` (truncated to 2k); `personas` array of `{ id, name }` |
| **Expected output** | JSON `{"persona_id": "<uuid>"}` |
| **Prompt** | `"You are a moderator for a structured conversation between multiple personas. The topic or opening line is: "${openingLine}". The following personas are available to speak. Choose exactly ONE persona to speak first. Consider who would naturally start this kind of discussion. Personas: ${list}. Respond with a single JSON object only."` |
| **Review** | Is JSON parsing robust enough? Should extraction fall back to regex if `extractJson` fails? |

### 10.3 `moderatorNextOrEnd(openingLine, personas, conversation, turnCount, maxTurns)`

| Item | Detail |
|------|--------|
| **Inputs** | Opening line; persona list; conversation transcript; current turn count; max turns |
| **Expected output** | JSON `{"action": "NEXT", "persona_id": "<uuid>"}` or `{"action": "END"}` |
| **Prompt** | Moderator role; conversation so far (truncated to 15k); if at max turns: `"IMPORTANT: conversation has reached the maximum of ${maxTurns} persona turns. You MUST respond with {"action": "END"}"`. Rules: don't choose same persona who just spoke unless others spoke in between. |
| **Review** | Does "must END at max turns" always work? What happens if the model ignores the instruction and returns NEXT? (Frontend would continue.) |

### 10.4 `moderatorSummarize(openingLine, conversation)`

| Item | Detail |
|------|--------|
| **Inputs** | Opening line (truncated to 2k); full conversation (truncated to 30k) |
| **Expected output** | Prose: summary of conversation + direct answer to opening line. No JSON. |
| **Prompt** | `"You are a moderator summarizing a conversation between personas. Opening line/topic: "${openingLine}". Full conversation: ${convoText}. Provide: 1. A concise summary (key points, agreements, disagreements, outcomes). 2. A direct answer or conclusion that addresses the opening line. Write in clear paragraphs. No JSON."` |
| **Review** | Is the 30k truncation sufficient for long conversations with many turns? |

---

## 11. Backend agent pipeline (Think → Respond → Validate)

> File: `backend/src/services/agentService.ts`

Model: `gemini-2.5-flash` for all three steps. Up to **3 quality rounds** (`MAX_QUALITY_ROUNDS = 3`).

Quality gate: `alignment_score >= 70 AND completeness_score >= 70`.

### 11.1 Think step (`thinkStep`)

| Item | Detail |
|------|--------|
| **Inputs** | Persona `{ name, description }`; last 10 history turns (each truncated to 5k); `userMessage` (truncated to 10k); optional `simulationInstructions` (8k); optional `previousThinking` (4k); optional retry context: `{ previousResponse, validation }` |
| **Expected output** | JSON `{ "thinking": "…" }` via `responseMimeType: 'application/json'` |
| **System prompt** | `"You are ${name}, ${description}. You are about to respond to a message. Complete knowledge documents will be provided in full on the next step—no search is required. Before responding, think carefully: What is the user really asking? Which documents are most relevant? How should you stay in character?"` + (on retry) quality revision block with previous scores/flags/suggestions + (if present) simulation context + previous thinking |
| **Returns** | `{ thinking, searchQueries: [] }` — `searchQueries` is always empty (vestigial) |

### 11.2 Retrieval (no AI call — full document load)

| Item | Detail |
|------|--------|
| **Function** | `loadFullKnowledgeDocuments(personaIds, sessionId, userId)` from `embeddingService.ts` |
| **What it loads** | (a) Persona name + description. (b) All `persona_files` content. (c) Session context fields (reconstructed from `knowledge_chunks`). (d) User's business profile. |
| **Per-document cap** | `MAX_FULL_DOCUMENT_CHARS = 120,000` chars |
| **Total context cap** | `MAX_RETRIEVED_CONTEXT_TOTAL_CHARS = 140,000` chars for the assembled section |
| **Note** | This is NOT vector search — it loads full documents. The `retrieve()` function exists but is unused by the agent pipeline. |

### 11.3 Respond step (`respondStep`)

| Item | Detail |
|------|--------|
| **Inputs** | Persona; full history (each truncated to 10k); user message (20k) + optional image inline; `thinking`; full retrieved knowledge markdown; `simulationInstructions`; optional revision context |
| **Expected output** | Plain text in-character reply |
| **System prompt** | `"You are ${name}, ${description}. You ARE this persona. Respond in first person as them. Never describe or reference the persona—speak only as them. Stay in character."` + (on retry) revision pass with previous draft + validation scores/flags + simulation instructions + thinking analysis + knowledge base sections |
| **System prompt cap** | Truncated to `MAX_SYSTEM_CHARS = 200,000` chars |

### 11.4 Validate step (`validateStep`)

| Item | Detail |
|------|--------|
| **Inputs** | Persona; user message (8k); draft response (8k); retrieved context summary (4k); `ragEmpty` flag; simulation instructions (2k) |
| **Expected output** | JSON `{ alignment_score: 1-100, completeness_score: 1-100, flags: [], suggestions: [], completeness_flags: [], completeness_suggestions: [] }` via `responseMimeType: 'application/json'` |
| **System prompt** | QA reviewer with two independent tasks: (1) Persona alignment — tone, expertise, consistency, character. (2) Answer completeness — addresses all parts, substantive, not truncated, not evasive. Includes `ragEmpty` warning if no knowledge documents were loaded. |
| **Empty response shortcut** | If model returns whitespace-only, validation is hard-coded to `alignment: 25, completeness: 5` without calling the model |
| **Validation failure** | If validate API throws, validation is set to null → substituted with `alignment: 50, completeness: 50, flags: ['Validation unavailable']` |

### 11.5 Call sites for agent pipeline

| File | Context | Key params |
|------|---------|-----------|
| `src/views/ChatPage.tsx` (line 467) | Chat page — user talks to persona | `personaId`, `personaIds` (all selected), `sessionId`, `history` (last 20 messages) |
| `src/views/SimulationPage.tsx` (line 874) | Persona conversation — each persona turn | `personaId` (current speaker), `personaIds` (all), `simulationInstructions`, `previousThinking` |
| `src/views/SimulationPage.tsx` (line 1068) | Batch simulation — initial run | `personaId`, `personaIds`, `history: []`, `simulationInstructions`, optional `image`/`mimeType` |
| `src/views/SimulationPage.tsx` (line 1256) | Persuasion follow-up — user sends message | `personaId`, `personaIds`, `sessionId`, `history`, `simulationInstructions`, `previousThinking` |

**Review:** Are thresholds 70/70 right for your brand risk? Is exposing validation flags in the UI helpful or noisy? Should `MAX_QUALITY_ROUNDS` be configurable per simulation type?

---

## 12. Backend embeddings & knowledge indexing

> File: `backend/src/services/embeddingService.ts`

### 12.1 `embedTexts(texts)`

| Item | Detail |
|------|--------|
| **Inputs** | Array of text strings |
| **Expected output** | Array of float vectors (one per input) |
| **API** | `ai.models.embedContent({ model: 'gemini-embedding-001', contents: batch })` |
| **Batch size** | 100 texts per API call |
| **Note** | Console log incorrectly says `text-embedding-004` while actual model is `gemini-embedding-001` |

### 12.2 `chunkText(text, maxWords?, overlapWords?)`

| Item | Detail |
|------|--------|
| **Defaults** | `CHUNK_MAX_WORDS = 400`, `CHUNK_OVERLAP_WORDS = 80` |
| **Algorithm** | Splits on blank lines (paragraphs), then sliding window with word overlap |
| **Review** | Do these sizes split legal/clinical content safely? |

### 12.3 `indexPersona(personaId)`

| Item | Detail |
|------|--------|
| **Inputs** | Persona ID |
| **What it indexes** | Persona `name + description` as `source_type: 'profile'` + each `persona_file` content as `source_type: 'file'` |
| **Process** | Chunk → embed → delete old chunks → insert new chunks with `content_hash` (SHA-256) → update `personas.last_embedded_at` |
| **Triggered by** | `personaService.createPersona`, `personaService.updatePersona` (when description changes), `adminController.reindexAll`, `agentController.indexUnindexed` |

### 12.4 `indexBusinessProfile(userId)`

| Item | Detail |
|------|--------|
| **Inputs** | User ID |
| **What it indexes** | All 20 business profile fields as labeled key-value text, `source_type: 'business_profile'` |
| **Triggered by** | `businessProfileService` after profile save |

### 12.5 `indexSessionContext(sessionId, fields)`

| Item | Detail |
|------|--------|
| **Inputs** | Session ID + field name→value map |
| **What it indexes** | Each non-empty field value chunked and stored as `source_type: 'session_context'`, `source_name: fieldName` |
| **Triggered by** | `agentApi.indexContext` from `SimulationPage.tsx` (fire-and-forget after creating a simulation session) |

### 12.6 `loadFullKnowledgeDocuments(personaIds, sessionId?, userId?)`

| Item | Detail |
|------|--------|
| **Purpose** | Load complete text for agent — **no vector search** |
| **Sources loaded** | (a) Persona profiles + files (direct DB queries, not embedding search). (b) Session context fields (reconstructed from `knowledge_chunks` rows). (c) User business profile (direct DB query). |
| **Per-document cap** | `MAX_FULL_DOCUMENT_CHARS = 120,000` |
| **Returns** | `RetrievedChunk[]` with `score: 1` |

### 12.7 `retrieve(query, personaIds, sessionId?, topK?, userId?)`

| Item | Detail |
|------|--------|
| **Purpose** | Vector similarity search against `knowledge_chunks` |
| **Process** | Embed query → fetch all matching chunks from DB → cosine similarity in JS → return top-K |
| **Used by** | `agentController.retrieveContext` endpoint — but **NOT used by the agent pipeline** (agent uses `loadFullKnowledgeDocuments` instead) |

### 12.8 `cosineSimilarity(a, b)`

Pure math helper — dot product / (norm_a * norm_b). Returns 0 on length mismatch.

---

## 13. Backend admin AI endpoints

> File: `backend/src/controllers/adminController.ts`

### 13.1 `testEmbed`

| Item | Detail |
|------|--------|
| **What it does** | Health check: validates API key, checks `knowledge_chunks` table exists, checks `embedding` column type, makes a live `embedTexts(['test embedding call'])` call, reports persona/chunk counts |
| **AI call** | `embedTexts(['test embedding call'])` → single embedding vector |
| **Expected output** | JSON `{ ok: boolean, checks: { api_key, knowledge_chunks_table, embedding_column, embed_api_call, data } }` |

### 13.2 `reindexAll`

| Item | Detail |
|------|--------|
| **What it does** | Finds all personas without embeddings, indexes each via `indexPersona(id)` |
| **AI calls** | `embedTexts` for each persona (chunked text → vectors) |
| **Streaming** | NDJSON progress events: `{ type: 'progress', current, total, personaName, status }` |

### 13.3 `indexUnindexed` (user-scoped)

> File: `backend/src/controllers/agentController.ts`

| Item | Detail |
|------|--------|
| **What it does** | Same as `reindexAll` but scoped to the requesting user's personas only |
| **AI calls** | `indexPersona` per unindexed persona → `embedTexts` |

---

## 14. Seed / legacy simulations

> File: `backend/src/migrations/migrate.ts`

When `simulations` table is empty, four legacy simulations are seeded. These have **no `simulation_type`** (defaults to `'report'` in schema) and use hand-written system prompts:

| Title | Icon | Input fields | System prompt structure |
|-------|------|-------------|----------------------|
| **Web Page Response** | `Monitor` | `bgInfo` (textarea), `stimulusImage` (image) | Persona analyzes uploaded webpage image. Simulates internal monologue or user-testing feedback. |
| **Marketing Material** | `Megaphone` | `bgInfo` (textarea), `stimulusImage` (image) | Persona reacts to marketing asset as target audience member. Raw, unfiltered reaction. |
| **Sales Pitch** | `TrendingUp` | `bgInfo` (textarea), `openingLine` (textarea) | Persona is the prospect being sold to. Responds to opening line in character. |
| **Investor Pitch** | `Briefcase` | `bgInfo` (textarea), `openingLine` (textarea) | Persona is the investor. Reviews pitch and states primary concern. |

All four share the same prompt structure:
- `### CORE DIRECTIVE` — "You ARE the persona, first person only"
- `### INPUTS` — Numbered list: (1) Who You Are = `{{SELECTED_PROFILE_FULL}}`, (2+) Runner's inputs
- `### INSTRUCTIONS` — Type-specific analysis steps
- `### INTERACTION` — Opening behavior instruction

**Review:** These lack `simulation_type` metadata — are they handled correctly by the typed simulation runtime in `SimulationPage.tsx`?

---

## 15. Templates catalog

> Directory: `templates/`

| File | Template name | Sections | Used by | AI step |
|------|--------------|----------|---------|---------|
| `marketCanvasTemplate.ts` | Market Canvas | Market Definition (job executor, core job, context, current solutions, success metrics) → Job Articulation (primary, emotional, social jobs) → Notes | `BuildPersonaPage` | Step 1 of synthetic user chain |
| `jobBuilderTemplate.ts` | Job Builder | Core Job Identification → Job Statement Builder → Job Map (8 steps: DEFINE → CONCLUDE) → Notes | `BuildPersonaPage` | Step 2 of synthetic user chain |
| `metricsTemplate.ts` | Metrics | Time/Quality Metrics → Outcome-Based Metrics (business outcomes table) → Notes | `BuildPersonaPage` | Step 3 of synthetic user chain |
| `agentProfileDetailedTemplate.ts` | 10-Point Agent Profile (Detailed) | Identity → Behavioral Profile → Core JTBD → Current Approach → Success Metrics → Constraints → Motivations & Fears → Communication Style → Workflow Context → Example Scenarios → Agent Notes → Research Use | `BuildPersonaPage` | Per-persona detailed profile |
| `agentBehaviorsTemplate.ts` | Agent Behaviors | Daily Workflow → Decision Making → Tech Adoption → Problem-Solving → Communication → Stress Response → Purchasing → Change Management → Scenario-Based → Behavioral Indicators → Summary | `BuildPersonaPage` | Per-persona behavior definition |
| `highFidelityPersonaTemplate.ts` | High-Fidelity Persona | Core Profile → Context & Identity → Cognitive Frame (JTBD) → Behavioral & Decision Dynamics → Operating/Interaction Model → Evidence, Beliefs, Triggers → Communication Style → Goals → Meta Attributes | `BuildPersonaPage` | Advisor blueprint (LinkedIn & document paths) |
| `customerSegmentTemplate.ts` | Customer Segment Profile | Per-segment: Identity → Needs & JTBD → Behaviors & Triggers → How We Reach Them (2–4 segments) | `geminiService.generateBusinessProfileMarketPositioning` | Embedded in market positioning prompt |
| `agentProfileTemplate.ts` | 10-Point Agent Profile (Lite) | Agent Identity → 1-10 Profiling Points → Example Scenarios | **UNUSED** — not imported by any app code | None (dead code) |

---

## 16. Legacy / dead paths

| Path | Notes |
|------|-------|
| `services/gemini.ts` (root) | Legacy duplicate using `process.env.API_KEY`, `gemini-1.5-flash`, `gemini-2.5-flash-image` (avatar), `gemini-3-pro-preview` (extended thinking). NOT imported by `src/views/*`. |
| `pages/BuildPersonaPage.tsx` (root) | Older duplicate of `src/views/BuildPersonaPage.tsx`. Same patterns. |
| `pages/ChatPage.tsx` (root) | Uses `geminiService.chat()` directly (no backend agent pipeline). |
| `pages/SimulationPage.tsx` (root) | Uses `geminiService.runSimulation()` and `chat()` directly. |
| `pages/HomePage.tsx`, `pages/SettingsPage.tsx`, `pages/LoginPage.tsx` (root) | Older view duplicates. |
| `templates/agentProfileTemplate.ts` | Lite agent profile template — not imported anywhere. |
| `src/views/ChatPage.tsx` imports `geminiService` | Import exists but **unused** — chat uses `agentApi.turnStream` (backend). |
| `agentApi.turn` (non-streaming) | Defined in `src/services/agentApi.ts` but never called. |
| `agentApi.retrieve` | Defined but never called from any view. |
| `agentApi.indexUnindexed` | Defined but never called from any view (only from agent controller). |
| `embeddingService.retrieve()` | Vector search function — exists but agent pipeline uses `loadFullKnowledgeDocuments` instead. |
| `generateBusinessProfileFromDocument` | Wrapper that runs all three profile generators in parallel — defined but never called directly (callers use the three individual functions from `BusinessProfilePage.tsx`). |

---

## 17. Global review checklist

1. **Secrets / key exposure:** Frontend `VITE_GEMINI_API_KEY` is exposed in browser requests to Google. Is this acceptable vs. proxying all calls through the backend?

2. **PII in prompts:** LinkedIn pastes, CVs, business documents, and full persona profiles are sent to Google's Gemini API. Update privacy policy and DPA as needed.

3. **Truncation risks:** Multiple hard limits (2k, 8k, 20k, 30k, 50k, 100k, 120k, 140k, 200k, 500k) — do any silently drop consent-critical or legally required content?

4. **JSON fragility:** Several flows parse JSON from free-form model output using regex (`extractJson`). Should `responseMimeType: 'application/json'` be enforced on all JSON-expecting calls? (Currently only `thinkStep` and `validateStep` use it.)

5. **Persuasion score consistency:** `computePersuasionScore` (external scoring) may disagree with in-character "Persuasion: N%" lines. Are both shown and is the discrepancy explained to users?

6. **Name deduplication bug:** `generatePersonaName` accepts only one argument but multiple callers pass `usedNames` as a second argument — it is silently ignored. Names may collide.

7. **Model mismatch in logs:** `embeddingService.ts` logs `"Calling text-embedding-004"` but the actual model is `gemini-embedding-001`.

8. **Legacy code divergence:** Root `services/gemini.ts` uses different models (`gemini-1.5-flash`, `gemini-3-pro-preview`) vs. `src/services/gemini.ts` (`gemini-2.5-flash`). If legacy pages are accessible, behavior differs.

9. **`report_example_content_base64` leak:** This config key is not in `alreadyRenderedKeys` for report type — its raw base64 content gets stringified into `### Additional config` in the system prompt.

10. **Unused code:** `agentProfileTemplate.ts`, `agentApi.turn`, `agentApi.retrieve`, `embeddingService.retrieve`, `generateBusinessProfileFromDocument` — should these be removed or are they planned?

11. **Retry resilience:** Only `runSimulation`, `chat`, and moderator functions have retry logic (503/502/504). `generateBasic`, `generateChain`, `extractFacts`, `generateAvatar`, and all business profile calls do NOT retry.

12. **Quality gate scope:** The 70/70 threshold in `agentService.ts` applies to ALL agent turns (chat + simulation). Should persuasion or report types have different thresholds?

---

*Generated from full codebase audit. When prompts or AI call patterns change, update this file or regenerate from `src/services/gemini.ts`, `backend/src/services/agentService.ts`, `backend/src/services/embeddingService.ts`, `src/views/BuildPersonaPage.tsx`, `src/views/SimulationPage.tsx`, `src/components/SimulationTemplateForm.tsx`, and `backend/src/services/simulationTemplateService.ts`.*
