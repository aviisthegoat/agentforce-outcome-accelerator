import React, { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Sparkles, Loader2, X } from 'lucide-react';
import {
  SimulationTemplate,
  SimulationInputField,
  SimulationType,
  SurveyQuestion,
  CreateSimulationRequest,
  UpdateSimulationRequest,
} from '../services/simulationTemplateApi.js';
import { simulationTemplateApi } from '../services/simulationTemplateApi.js';
import { geminiService, GEMINI_FILE_INPUT_ACCEPT } from '../services/gemini.js';
import { getSimulationIcon, SIMULATION_ICON_DEFAULT } from '../utils/simulationIcons.js';

const SIMULATION_TYPES: { id: SimulationType; label: string; description: string; icon: string }[] = [
  { id: 'report', label: 'Report', description: 'A single downloadable report from the persona’s perspective: one paragraph of reasoning, then a structured report. No chat or follow-up.', icon: 'FileText' },
  { id: 'persuasion_simulation', label: 'Persuasion Simulation', description: 'Back-and-forth chat where the persona’s level of persuasion is tracked. At the end they state a single persuasion percentage (e.g. “Persuasion: 75%”).', icon: 'MessageSquare' },
  { id: 'response_simulation', label: 'Response Simulation', description: 'One response only: confidence level, a single output (numeric, action, or text), and up to one paragraph of reasoning. No chat.', icon: 'Target' },
  { id: 'survey', label: 'Survey', description: 'The persona answers survey questions in context. Output is survey responses (e.g. for CSV export) and optionally a short summary. No chat.', icon: 'BarChart3' },
  { id: 'persona_conversation', label: 'Persona v Persona Conversation', description: 'Moderated multi-persona discussion: multiple personas discuss an opening line in turns. An LLM moderator chooses who speaks next and when to end; after the conversation, the moderator summarizes and answers the opening line. Each persona turn is a separate API call; max 20 persona turns.', icon: 'Users' },
  { id: 'idea_generation', label: 'Idea Generation', description: "Single response with a fixed number of ideas from the persona's perspective. Output is always a bullet list of ideas. No chat or follow-up.", icon: 'Lightbulb' },
];

const PERSONA_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'synthetic_user', label: 'Synthetic User' },
  { value: 'advisor', label: 'Advisor' },
];

type SurveyMode = 'generated' | 'custom';

interface SimulationTemplateFormProps {
  simulation?: SimulationTemplate | null;
  onSubmit: (data: CreateSimulationRequest | UpdateSimulationRequest) => Promise<void>;
  onCancel: () => void;
}

export const SimulationTemplateForm: React.FC<SimulationTemplateFormProps> = ({
  simulation,
  onSubmit,
  onCancel,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [simulationType, setSimulationType] = useState<SimulationType | ''>('');
  const [allowedPersonaTypes, setAllowedPersonaTypes] = useState<string[]>([]);
  const [personaCountMin, setPersonaCountMin] = useState(1);
  const [personaCountMax, setPersonaCountMax] = useState(1);
  const [typeSpecificConfig, setTypeSpecificConfig] = useState<Record<string, unknown>>({});
  const [inputFields, setInputFields] = useState<SimulationInputField[]>(() => [
    { name: '', type: 'text', required: false },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const regeneratingCancelledRef = useRef(false);
  const [isImprovingWithAI, setIsImprovingWithAI] = useState(false);
  const [showPromptReview, setShowPromptReview] = useState(false);
  const [reviewedSystemPrompt, setReviewedSystemPrompt] = useState('');

  const setConfig = (key: string, value: unknown) =>
    setTypeSpecificConfig((prev) => ({ ...prev, [key]: value }));

  useEffect(() => {
    if (simulation) {
      setTitle(simulation.title);
      setDescription(simulation.description || '');
      setSystemPrompt(simulation.system_prompt);
      setIsActive(simulation.is_active);
      setSimulationType(simulation.simulation_type || '');
      setAllowedPersonaTypes(simulation.allowed_persona_types?.length ? simulation.allowed_persona_types : []);
      setPersonaCountMin(simulation.persona_count_min ?? 1);
      setPersonaCountMax(simulation.persona_count_max ?? 1);
      setTypeSpecificConfig(simulation.type_specific_config || {});
      setInputFields(simulation.required_input_fields || []);
      setShowPromptReview(false);
      setReviewedSystemPrompt('');
    }
  }, [simulation]);

  // When switching to persona_conversation, suggest multi-persona defaults
  useEffect(() => {
    if (simulationType === 'persona_conversation' && personaCountMin === 1 && personaCountMax === 1) {
      setPersonaCountMin(2);
      setPersonaCountMax(10);
    }
  }, [simulationType]);

  // When switching to idea_generation, set default num_ideas if not present
  useEffect(() => {
    if (simulationType === 'idea_generation' && (typeSpecificConfig.num_ideas == null || typeof typeSpecificConfig.num_ideas !== 'number')) {
      setConfig('num_ideas', 5);
    }
  }, [simulationType]);

  const handleAddField = () => {
    setInputFields([
      ...inputFields,
      { name: '', type: 'text', required: false },
    ]);
  };

  const handleRemoveField = (index: number) => {
    if (inputFields.length <= 1) return; // require at least one input field
    setInputFields(inputFields.filter((_, i) => i !== index));
  };

  const handleFieldChange = (index: number, field: Partial<SimulationInputField>) => {
    const updated = [...inputFields];
    updated[index] = { ...updated[index], ...field };
    setInputFields(updated);
  };

  const togglePersonaType = (value: string) => {
    setAllowedPersonaTypes((prev) =>
      prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]
    );
  };

  const handleImproveWithAI = async () => {
    setIsImprovingWithAI(true);
    try {
      const prompt = `You are helping improve a simulation description. The description is used by AI to generate a simulation's system prompt. Improve the following text so it clearly includes:
- purpose/goal (what the simulation aims to achieve)
- tone (e.g. professional, advisory, conversational)
- audience/context (who the persona is addressing)
- success criteria (what "good" looks like for this simulation)

Return ONLY the improved description text, nothing else. No preamble, no quotes, no markdown. Plain text only.

Current description:
${description.trim() || '(empty - please create an initial description based on the simulation title and type)'}`;
      const improved = await geminiService.generateBasic(prompt, false);
      const text = typeof improved === 'string' ? improved.trim() : String(improved || '').trim();
      if (text) setDescription(text);
    } catch (err: any) {
      console.error('Improve with AI error:', err);
      alert(err?.message || 'Failed to improve description. Check your Gemini API key and try again.');
    } finally {
      setIsImprovingWithAI(false);
    }
  };

  // Survey Generated: questions list
  const surveyQuestions = (typeSpecificConfig.survey_questions as SurveyQuestion[]) || [];
  const setSurveyQuestions = (qs: SurveyQuestion[]) => setConfig('survey_questions', qs);
  const addSurveyQuestion = () => setSurveyQuestions([...surveyQuestions, { type: 'text', question: '' }]);
  const removeSurveyQuestion = (idx: number) => setSurveyQuestions(surveyQuestions.filter((_, i) => i !== idx));
  const updateSurveyQuestion = (idx: number, patch: Partial<SurveyQuestion>) => {
    const next = [...surveyQuestions];
    next[idx] = { ...next[idx], ...patch };
    setSurveyQuestions(next);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      alert('Title is required');
      return;
    }
    if (simulationType && !description.trim()) {
      alert('What is this simulation about? is required');
      return;
    }
    if (!simulationType && !systemPrompt.trim()) {
      alert('System prompt is required for legacy simulations');
      return;
    }
    if (simulationType && !allowedPersonaTypes.length) {
      alert('Select at least one persona type');
      return;
    }
    const hasAtLeastOneInputWithName = inputFields.some((f) => f.name.trim());
    if (!hasAtLeastOneInputWithName) {
      alert('At least one runner input field is required and must have a name');
      return;
    }
    if (personaCountMin > personaCountMax) {
      alert('Min personas cannot exceed max personas');
      return;
    }
    if (simulationType === 'response_simulation' && (typeSpecificConfig.decision_type as string) === 'numeric') {
      const unit = (typeSpecificConfig.unit as string)?.trim();
      if (!unit) {
        alert('Unit is required for numeric Response Simulation (e.g. minutes, dollars, %)');
        return;
      }
    }
    if (simulationType === 'survey' && (typeSpecificConfig.survey_mode as SurveyMode) === 'generated') {
      if (!surveyQuestions.length || surveyQuestions.some((q) => !q.question.trim())) {
        alert('Generated survey must have at least one question with text');
        return;
      }
      for (let i = 0; i < surveyQuestions.length; i++) {
        const q = surveyQuestions[i];
        if (q.type === 'multiple_choice' && (!q.options || q.options.filter(Boolean).length === 0)) {
          alert(`Question ${i + 1} (multiple choice) must have at least one option`);
          return;
        }
      }
    }
    for (const field of inputFields) {
      if (!field.name.trim()) {
        alert('All runner input fields must have a name');
        return;
      }
      if (field.type === 'multiple_choice' && (!field.options || field.options.length === 0)) {
        alert(`Field "${field.name}" (multiple choice) must have at least one option`);
        return;
      }
    }

    // Already in review step: save with the edited prompt
    if (showPromptReview) {
      setIsSubmitting(true);
      try {
        const data: CreateSimulationRequest | UpdateSimulationRequest = {
          title: title.trim(),
          description: description.trim() || undefined,
          icon: resolvedIcon,
          required_input_fields: inputFields,
          is_active: isActive,
          system_prompt: reviewedSystemPrompt.trim(),
        };
        if (simulation) {
          (data as UpdateSimulationRequest).simulation_type = simulationType || undefined;
          (data as UpdateSimulationRequest).allowed_persona_types = allowedPersonaTypes;
          (data as UpdateSimulationRequest).persona_count_min = personaCountMin;
          (data as UpdateSimulationRequest).persona_count_max = personaCountMax;
          (data as UpdateSimulationRequest).type_specific_config = Object.keys(typeSpecificConfig).length ? typeSpecificConfig : undefined;
        } else {
          (data as CreateSimulationRequest).simulation_type = (simulationType as SimulationType) || undefined;
          (data as CreateSimulationRequest).allowed_persona_types = allowedPersonaTypes;
          (data as CreateSimulationRequest).persona_count_min = personaCountMin;
          (data as CreateSimulationRequest).persona_count_max = personaCountMax;
          (data as CreateSimulationRequest).type_specific_config = Object.keys(typeSpecificConfig).length ? typeSpecificConfig : undefined;
        }
        await onSubmit(data);
      } catch (error: any) {
        alert(`Failed to save: ${error.message || 'Unknown error'}`);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // With a type selected: generate prompt and show review step
    if (simulationType) {
      setIsSubmitting(true);
      try {
        if (simulation) {
          setReviewedSystemPrompt(simulation.system_prompt || '');
          setShowPromptReview(true);
        } else {
          const payload: CreateSimulationRequest = {
            title: title.trim(),
            description: description.trim() || undefined,
            icon: resolvedIcon,
            required_input_fields: inputFields,
            is_active: isActive,
            simulation_type: simulationType as SimulationType,
            allowed_persona_types: allowedPersonaTypes,
            persona_count_min: personaCountMin,
            persona_count_max: personaCountMax,
            type_specific_config: Object.keys(typeSpecificConfig).length ? typeSpecificConfig : undefined,
          };
          let systemPromptText: string;
          try {
            systemPromptText = await geminiService.generateSystemPromptFromConfig(payload);
          } catch (aiError: any) {
            const fallback = await simulationTemplateApi.previewPrompt(payload);
            systemPromptText = fallback.system_prompt;
          }
          setReviewedSystemPrompt(systemPromptText);
          setShowPromptReview(true);
        }
      } catch (error: any) {
        alert(`Failed to generate prompt: ${error.message || 'Unknown error'}`);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Legacy: no type, submit with raw system prompt
    setIsSubmitting(true);
    try {
      const data: CreateSimulationRequest | UpdateSimulationRequest = {
        title: title.trim(),
        description: description.trim() || undefined,
        icon: resolvedIcon,
        required_input_fields: inputFields,
        is_active: isActive,
        system_prompt: systemPrompt.trim(),
      };
      await onSubmit(data);
    } catch (error: any) {
      alert(`Failed to save: ${error.message || 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const surveyMode = (typeSpecificConfig.survey_mode as SurveyMode) || 'generated';

  // Icon is always the default for the selected simulation type (or default for legacy)
  const resolvedIcon = simulationType
    ? (SIMULATION_TYPES.find((t) => t.id === simulationType)?.icon ?? '').trim() || undefined
    : SIMULATION_ICON_DEFAULT;

  const handleCancelRegenerate = () => {
    regeneratingCancelledRef.current = true;
    setIsRegenerating(false);
  };

  const handleRegeneratePrompt = async () => {
    if (!simulationType) return;
    regeneratingCancelledRef.current = false;
    setIsRegenerating(true);
    try {
      const payload: CreateSimulationRequest = {
        title: title.trim(),
        description: description.trim() || undefined,
        icon: resolvedIcon,
        required_input_fields: inputFields,
        is_active: isActive,
        simulation_type: simulationType as SimulationType,
        allowed_persona_types: allowedPersonaTypes,
        persona_count_min: personaCountMin,
        persona_count_max: personaCountMax,
        type_specific_config: Object.keys(typeSpecificConfig).length ? typeSpecificConfig : undefined,
      };
      let systemPromptText: string;
      try {
        systemPromptText = await geminiService.generateSystemPromptFromConfig(payload);
      } catch (aiError: unknown) {
        const fallback = await simulationTemplateApi.previewPrompt(payload);
        systemPromptText = fallback.system_prompt;
      }
      if (!regeneratingCancelledRef.current) setReviewedSystemPrompt(systemPromptText);
    } catch (error: unknown) {
      if (!regeneratingCancelledRef.current) {
        alert(`Failed to regenerate prompt: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    } finally {
      setIsRegenerating(false);
    }
  };

  if (showPromptReview) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Review system prompt</h2>
            <p className="text-sm text-gray-600">Edit the generated prompt if needed, then click Save to finalize.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {simulation && (
              <button
                type="button"
                onClick={handleRegeneratePrompt}
                disabled={isRegenerating}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {isRegenerating ? 'Regenerating...' : 'Regenerate system prompt'}
              </button>
            )}
            {isRegenerating && (
              <button
                type="button"
                onClick={handleCancelRegenerate}
                className="flex items-center gap-1.5 px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-medium"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            )}
          </div>
        </div>
        <textarea
          value={reviewedSystemPrompt}
          onChange={(e) => setReviewedSystemPrompt(e.target.value)}
          rows={14}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-indigo-500"
          placeholder="System prompt..."
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowPromptReview(false)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            Back
          </button>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent); }}
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
          >
            {isSubmitting ? 'Saving...' : 'Save to finalize'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {/* 1. Simulation type */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-gray-900">Simulation type</h2>
        <p className="text-sm text-gray-600">Choose the type of simulation. This determines how it runs and what outputs users see.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {SIMULATION_TYPES.map(({ id, label, description, icon: iconName }) => {
            const TypeIcon = getSimulationIcon(iconName);
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSimulationType(id)}
                className={`text-left px-4 py-3 rounded-lg border-2 transition-colors flex gap-3 ${
                  simulationType === id
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-300'
                }`}
              >
                <div className="shrink-0 w-10 h-10 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <TypeIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <span className="block text-sm font-medium">{label}</span>
                  <span className="block mt-1 text-xs text-gray-500">{description}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* 2. Title */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">Title</h2>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          placeholder="e.g., Web Page Response"
        />
      </section>

      {/* 3. What is this simulation about? */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-gray-900">What is this simulation about?</h2>
        <p className="text-sm text-gray-600">
          This description is used by AI to generate the simulation’s system prompt. Write clearly so the AI can infer purpose, tone, and behavior—it will not be shown verbatim to the persona.
        </p>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleImproveWithAI}
            disabled={isImprovingWithAI}
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImprovingWithAI ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Improving…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Improve with AI
              </>
            )}
          </button>
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          required={!!simulationType}
          rows={4}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
          placeholder="e.g., The persona advises the user on a go-to-market strategy for their product. Tone: direct and data-driven. Audience: a founder or product lead. Success: concrete next steps and clear prioritization, no generic advice."
        />
      </section>

      {/* 4. Persona configuration */}
      <section className="space-y-4 border-t border-gray-200 pt-8">
        <h2 className="text-lg font-semibold text-gray-900">Who can run this simulation</h2>
        <p className="text-sm text-gray-600">Select which persona types are allowed to run this simulation, and how many personas the user must select.</p>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Persona types *</label>
          <p className="text-xs text-gray-500 mb-2">At least one is required.</p>
          <div className="flex flex-wrap gap-4">
            {PERSONA_TYPE_OPTIONS.map(({ value, label }) => (
              <label key={value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowedPersonaTypes.includes(value)}
                  onChange={() => togglePersonaType(value)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 max-w-xs">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min number of personas</label>
            <select
              value={personaCountMin}
              onChange={(e) => setPersonaCountMin(Number(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max number of personas</label>
            <select
              value={personaCountMax}
              onChange={(e) => setPersonaCountMax(Number(e.target.value))}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {/* 5. Type-specific configuration */}
      {simulationType && (
        <section className="space-y-4 border-t border-gray-200 pt-8">
          <h2 className="text-lg font-semibold text-gray-900">Configuration for {SIMULATION_TYPES.find((t) => t.id === simulationType)?.label}</h2>
          <p className="text-sm text-gray-600">Settings that define how this simulation type behaves. These are not shown to the person running the simulation.</p>

          {simulationType === 'report' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Report structure (sections/headings) *</label>
                <textarea
                  value={(typeSpecificConfig.report_structure as string) || ''}
                  onChange={(e) => setConfig('report_structure', e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g., Executive Summary, Methodology, Findings..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Example document (optional)</label>
                <p className="text-xs text-gray-500 mb-2">Upload a PDF or other supported file to use as an example/reference for the report.</p>
                {(typeSpecificConfig.report_example_file_name as string) ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700 truncate flex-1">{(typeSpecificConfig.report_example_file_name as string)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setConfig('report_example_file_name', undefined);
                        setConfig('report_example_content_base64', undefined);
                      }}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 text-sm"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <input
                    type="file"
                    accept={GEMINI_FILE_INPUT_ACCEPT}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const base64 = (reader.result as string)?.split(',')[1];
                        if (base64) {
                          setConfig('report_example_file_name', file.name);
                          setConfig('report_example_content_base64', base64);
                        }
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                    className="w-full text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                  />
                )}
              </div>
            </>
          )}

          {simulationType === 'persuasion_simulation' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Context label (for user, optional — can be cleared)</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={(typeSpecificConfig.context_label as string) || ''}
                    onChange={(e) => setConfig('context_label', e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="e.g., Context"
                  />
                  <button
                    type="button"
                    onClick={() => setConfig('context_label', '')}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-100 text-sm whitespace-nowrap"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Persuasion goal (what the user is trying to persuade the persona of) *</label>
                <textarea
                  value={(typeSpecificConfig.decision_point as string) || ''}
                  onChange={(e) => setConfig('decision_point', e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="What is the user trying to persuade the persona of?"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">How persuaded is measured (criteria for the final percentage)</label>
                <textarea
                  value={(typeSpecificConfig.decision_criteria as string) || ''}
                  onChange={(e) => setConfig('decision_criteria', e.target.value)}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  placeholder="Criteria used to determine the persuasion percentage..."
                />
              </div>
            </>
          )}

          {simulationType === 'response_simulation' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Decision type</label>
                <select
                  value={(typeSpecificConfig.decision_type as string) || 'numeric'}
                  onChange={(e) => setConfig('decision_type', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="numeric">Numeric (e.g. time, $)</option>
                  <option value="action">Action (multiple choice)</option>
                  <option value="text">Text (answer to a question)</option>
                </select>
              </div>
              {(typeSpecificConfig.decision_type as string) === 'numeric' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Unit (required) *</label>
                  <input
                    type="text"
                    value={(typeSpecificConfig.unit as string) || ''}
                    onChange={(e) => setConfig('unit', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="e.g. minutes, dollars, %, hours, kg"
                  />
                  <p className="text-xs text-gray-500 mt-1">The response will show the number with this unit (e.g. &quot;45 minutes&quot;).</p>
                </div>
              )}
              {(typeSpecificConfig.decision_type as string) === 'action' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Possible outputs (comma-separated)</label>
                  <input
                    type="text"
                    value={(typeSpecificConfig.action_options as string) || ''}
                    onChange={(e) => setConfig('action_options', e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    placeholder="e.g., Click, Don't click"
                  />
                </div>
              )}
            </>
          )}

          {simulationType === 'survey' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Survey mode</label>
                <div className="flex gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="survey_mode"
                      checked={surveyMode === 'generated'}
                      onChange={() => setConfig('survey_mode', 'generated')}
                      className="border-gray-300 text-indigo-600"
                    />
                    <span className="text-sm">Generated (define questions below)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="survey_mode"
                      checked={surveyMode === 'custom'}
                      onChange={() => setConfig('survey_mode', 'custom')}
                      className="border-gray-300 text-indigo-600"
                    />
                    <span className="text-sm">Custom (build questions in Runner input fields below)</span>
                  </label>
                </div>
              </div>
              {surveyMode === 'generated' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">What is this survey for?</label>
                    <textarea
                      value={(typeSpecificConfig.survey_purpose as string) || ''}
                      onChange={(e) => setConfig('survey_purpose', e.target.value)}
                      rows={2}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                      placeholder="Survey purpose or format..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Questions</label>
                    <div className="space-y-3">
                      {surveyQuestions.map((q, idx) => (
                        <div key={idx} className="p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-medium text-gray-700">Question {idx + 1}</span>
                            <button type="button" onClick={() => removeSurveyQuestion(idx)} className="text-red-600 hover:text-red-800 text-sm">
                              Remove
                            </button>
                          </div>
                          <select
                            value={q.type}
                            onChange={(e) => updateSurveyQuestion(idx, { type: e.target.value as SurveyQuestion['type'] })}
                            className="w-full max-w-[180px] px-3 py-1.5 text-sm border border-gray-300 rounded"
                          >
                            <option value="text">Text</option>
                            <option value="numeric">Numeric</option>
                            <option value="multiple_choice">Multiple choice</option>
                          </select>
                          <input
                            type="text"
                            value={q.question}
                            onChange={(e) => updateSurveyQuestion(idx, { question: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                            placeholder="Question text"
                          />
                          {q.type === 'multiple_choice' && (
                            <div className="space-y-1 mt-2">
                              <span className="text-xs text-gray-600">Options</span>
                              {(q.options || []).map((opt, oi) => (
                                <div key={oi} className="flex gap-2">
                                  <input
                                    type="text"
                                    value={opt}
                                    onChange={(e) => {
                                      const opts = [...(q.options || [])];
                                      opts[oi] = e.target.value;
                                      updateSurveyQuestion(idx, { options: opts });
                                    }}
                                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => updateSurveyQuestion(idx, { options: (q.options || []).filter((_, i) => i !== oi) })}
                                    className="text-red-600 text-sm"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => updateSurveyQuestion(idx, { options: [...(q.options || []), ''] })}
                                className="text-sm text-indigo-600 flex items-center gap-1"
                              >
                                <Plus className="w-4 h-4" /> Add option
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addSurveyQuestion}
                        className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-indigo-400 flex items-center justify-center gap-2 text-sm"
                      >
                        <Plus className="w-4 h-4" />{' '}
                        {surveyQuestions.length === 0 ? 'Add question' : 'Add another question'}
                      </button>
                    </div>
                  </div>
                </>
              )}
              {surveyMode === 'custom' && (
                <p className="text-sm text-gray-500">Use the Runner input fields section below to add the survey questions. The persona will respond with the survey background as context.</p>
              )}
            </>
          )}

          {simulationType === 'persona_conversation' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Max persona turns (API calls)</label>
              <p className="text-xs text-gray-500 mb-2">Each persona response is one API call. Set a cap so the conversation stops after this many turns (e.g. 10 = up to 10 persona responses).</p>
              <select
                value={(typeSpecificConfig.max_persona_turns as number) ?? 20}
                onChange={(e) => setConfig('max_persona_turns', Number(e.target.value))}
                className="w-full max-w-[200px] px-4 py-2 border border-gray-300 rounded-lg"
              >
                {[5, 8, 10, 12, 15, 20, 25, 30, 40, 50].map((n) => (
                  <option key={n} value={n}>{n} turns</option>
                ))}
              </select>
            </div>
          )}

          {simulationType === 'idea_generation' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Number of ideas *</label>
              <p className="text-xs text-gray-500 mb-2">The persona will always output exactly this many ideas as a bullet list.</p>
              <select
                value={(typeSpecificConfig.num_ideas as number) ?? 5}
                onChange={(e) => setConfig('num_ideas', Number(e.target.value))}
                className="w-full max-w-[200px] px-4 py-2 border border-gray-300 rounded-lg"
              >
                {[3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20].map((n) => (
                  <option key={n} value={n}>{n} ideas</option>
                ))}
              </select>
            </div>
          )}

        </section>
      )}

      {/* 6. Runner input fields */}
      <section className="space-y-4 border-t border-gray-200 pt-8">
        <h2 className="text-lg font-semibold text-gray-900">Inputs the person running the simulation will provide *</h2>
        <p className="text-sm text-gray-600">At least one field is required. These fields are shown to the user when they run this simulation (e.g. background context, opening line, file uploads).</p>
        <div className="space-y-3">
          {inputFields.map((field, index) => (
            <div key={index} className="p-4 border border-gray-200 rounded-lg bg-gray-50">
              <div className="flex items-start justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">Field {index + 1}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveField(index)}
                  disabled={inputFields.length <= 1}
                  className="text-red-600 hover:text-red-800 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={inputFields.length <= 1 ? 'At least one input field is required' : 'Remove field'}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Field name *</label>
                  <input
                    type="text"
                    value={field.name}
                    onChange={(e) => handleFieldChange(index, { name: e.target.value })}
                    required
                    readOnly={field.type === 'business_profile'}
                    className={`w-full px-3 py-1.5 text-sm border border-gray-300 rounded ${field.type === 'business_profile' ? 'bg-gray-100' : ''}`}
                    placeholder={field.type === 'business_profile' ? 'businessProfile' : 'e.g., bgInfo'}
                  />
                  {field.type === 'business_profile' && (
                    <p className="text-xs text-gray-500 mt-1">Injects the runner&apos;s saved business/company background from Business Profile (used in personas and simulations). Placeholder: &#123;&#123;BUSINESSPROFILE&#125;&#125;</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Type *</label>
                    <select
                    value={field.type === 'textarea' ? 'text' : field.type}
                    onChange={(e) => {
                      const newType = e.target.value as SimulationInputField['type'];
                      const updates: Partial<SimulationInputField> = newType === 'multiple_choice' && !(field.options?.length) ? { type: newType, options: [''] } : { type: newType };
                      if (newType === 'business_profile') updates.name = 'businessProfile';
                      handleFieldChange(index, updates);
                    }}
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded"
                  >
                    <option value="text">Text</option>
                    <option value="image">Image</option>
                    <option value="table">Table (CSV, Excel)</option>
                    <option value="pdf">File upload (all file types)</option>
                    <option value="multiple_choice">Multiple choice</option>
                    <option value="business_profile">Business background</option>
                    <option value="survey_questions">Survey question creation</option>
                  </select>
                </div>
              </div>
              {field.type === 'multiple_choice' && (
                <div className="mt-3 space-y-2">
                  <label className="block text-xs text-gray-600">Options *</label>
                  {(field.options || []).map((opt, optIdx) => (
                    <div key={optIdx} className="flex gap-2">
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => {
                          const opts = [...(field.options || [])];
                          opts[optIdx] = e.target.value;
                          handleFieldChange(index, { options: opts });
                        }}
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded"
                      />
                      <button type="button" onClick={() => handleFieldChange(index, { options: (field.options || []).filter((_, i) => i !== optIdx) })} className="text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={() => handleFieldChange(index, { options: [...(field.options || []), ''] })} className="text-sm text-indigo-600 flex items-center gap-1">
                    <Plus className="w-4 h-4" /> Add option
                  </button>
                </div>
              )}
              <div className="mt-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(e) => handleFieldChange(index, { required: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 w-5 h-5"
                  />
                  <span className="text-sm text-gray-700">Required</span>
                </label>
              </div>
            </div>
          ))}
          <button type="button" onClick={handleAddField} className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-indigo-400 flex items-center justify-center gap-2">
            <Plus className="w-4 h-4" /> Add input field
          </button>
        </div>
      </section>

      {/* 8. Active + 9. Submit / Cancel */}
      <section className="border-t border-gray-200 pt-8 space-y-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded border-gray-300 text-indigo-600 w-4 h-4" />
          <span className="text-sm text-gray-700">Active (visible to users)</span>
        </label>
        {!simulationType && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">System prompt * (legacy)</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              required={!simulationType}
              rows={6}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg font-mono text-sm"
              placeholder="Use {{SELECTED_PROFILE}}, {{SELECTED_PROFILE_FULL}}, {{BACKGROUND_INFO}}, and required input field names as {{FIELD_NAME}}"
            />
          </div>
        )}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
          >
            {isSubmitting ? 'Saving...' : simulation ? 'Update Simulation' : 'Create Simulation'}
          </button>
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </section>
    </form>
  );
};
