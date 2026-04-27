
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { 
  ChevronRight, 
  ChevronDown,
  Upload, 
  User, 
  ArrowLeft, 
  Loader2, 
  Sparkles,
  Send,
  AlertCircle,
  History,
  Trash2,
  Plus,
  X as CloseIcon,
  XCircle,
  LucideIcon,
  Download,
} from 'lucide-react';
import { Persona, SimulationMode, Message, SimulationSession, FocusGroup } from '../models/types.js';
import type { BusinessProfile } from '../models/types.js';
import { useAvailablePersonas } from '../hooks/usePersonas.js';
import { simulationApi } from '../services/simulationApi.js';
import { personaApi } from '../services/personaApi.js';
import { geminiService } from '../services/gemini.js';
import {
  agentApi,
  finalizePipelineEvents,
  pipelineEventsFromPersonaResult,
  pipelineEventsFromStoredMessage,
} from '../services/agentApi.js';
import type { AgentPipelineEvent, RetrievalInfo, ValidationInfo } from '../services/agentApi.js';
import AgentPipelineViewer from '../components/AgentPipelineViewer.js';
import { getBusinessProfile } from '../services/businessProfileApi.js';
import { businessProfileToPromptString } from '../utils/businessProfile.js';
import { simulationTemplateApi, SimulationTemplate } from '../services/simulationTemplateApi.js';
import { focusGroupApi } from '../services/focusGroupApi.js';
import type { SurveyQuestion } from '../services/simulationTemplateApi.js';
import { getSimulationIcon } from '../utils/simulationIcons.js';
import { useAuth } from '../context/AuthContext.js';
import { getRunnerDisplayName, getStablePersonaFallbackName, getPersonaDisplayName } from '../utils/humanNames.js';
import { coerceSinglePersuasionScore, parseLastPersuasionPercentFromText } from '../utils/persuasionScore.js';
import { interviewSamples } from '../data/interviewSamples.js';

const MAX_PERSONA_TURNS = 20;

/** Persist think / RAG / validation on simulation messages (local + API). */
function messageMetadataFromAgentTurn(agent: {
  thinking?: string;
  retrieval?: RetrievalInfo;
  validation?: ValidationInfo | null;
}): Pick<Message, 'thinking' | 'retrieval_summary' | 'validation'> {
  const thinking = agent.thinking?.trim() ? agent.thinking : undefined;
  const retrieval_summary = agent.retrieval
    ? {
        queries: agent.retrieval.queries,
        chunks: agent.retrieval.chunks,
        ragEmpty: agent.retrieval.ragEmpty,
      }
    : undefined;
  const validation = agent.validation ?? undefined;
  return { thinking, retrieval_summary, validation };
}

function personaResultToApiRow(r: {
  personaId: string;
  content: string;
  thinking?: string;
  retrieval?: RetrievalInfo;
  validation?: ValidationInfo | null;
}) {
  return {
    sender_type: 'persona' as const,
    persona_id: r.personaId,
    content: r.content,
    thinking: r.thinking ?? null,
    retrieval_summary: r.retrieval ?? null,
    validation: r.validation ?? null,
  };
}

/** Truncate text to at most maxWords; append "..." if longer. Used for simulation description on simulate page. */
function truncateDescriptionToWords(text: string, maxWords: number = 25): string {
  const t = (text || '').trim();
  if (!t) return t;
  const words = t.split(/\s+/);
  if (words.length <= maxWords) return t;
  return words.slice(0, maxWords).join(' ') + '...';
}
const getIcon = (iconName?: string): LucideIcon => getSimulationIcon(iconName);

const STORAGE_KEY_LEFT = 'simulation-left-panel-width';
const STORAGE_KEY_RIGHT = 'simulation-right-panel-width';
const DEFAULT_LEFT = 288;
const DEFAULT_RIGHT = 448;
const MIN_LEFT = 200;
const MAX_LEFT = 500;
const MIN_RIGHT = 280;
const MAX_RIGHT = 600;

const ResizableDivider: React.FC<{
  onDrag: (delta: number) => void;
  orientation?: 'vertical';
}> = ({ onDrag, orientation = 'vertical' }) => {
  const [isDragging, setIsDragging] = useState(false);
  const lastX = useRef(0);

  useEffect(() => {
    if (!isDragging) return;
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - lastX.current;
      lastX.current = e.clientX;
      onDrag(delta);
    };
    const onUp = () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      setIsDragging(false);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging, onDrag]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    lastX.current = e.clientX;
    setIsDragging(true);
  };

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      onMouseDown={handleMouseDown}
      className={`shrink-0 w-1.5 flex items-center justify-center cursor-col-resize hover:bg-indigo-100 active:bg-indigo-200 transition-colors group select-none ${
        isDragging ? 'bg-indigo-200' : 'bg-transparent'
      }`}
    >
      <div className="w-0.5 h-8 rounded-full bg-gray-300 group-hover:bg-indigo-400 group-active:bg-indigo-500 transition-colors" />
    </div>
  );
};

const FormattedSimulationResponse: React.FC<{ content: string; isUser?: boolean }> = ({ content, isUser = false }) => {
  const lines = content.split('\n');
  
  const processLine = (line: string, lineIdx: number): React.ReactNode => {
    // Handle headers (## or ###)
    if (line.trim().startsWith('###')) {
      const headerText = line.replace(/^###+\s*/, '');
      return (
        <h3 key={lineIdx} className={`font-black text-lg mb-2 mt-4 ${isUser ? 'text-white' : 'text-gray-900'}`}>
          {processInlineFormatting(headerText, lineIdx)}
        </h3>
      );
    }
    
    if (line.trim().startsWith('##')) {
      const headerText = line.replace(/^##+\s*/, '');
      return (
        <h2 key={lineIdx} className={`font-black text-xl mb-2 mt-4 ${isUser ? 'text-white' : 'text-gray-900'}`}>
          {processInlineFormatting(headerText, lineIdx)}
        </h2>
      );
    }

    // Handle simple lists (lines starting with - or * or numbered)
    const listMatch = line.match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const indent = listMatch[1].length;
      const content = listMatch[3];
      const indentClass = indent === 0 ? 'pl-0' : indent <= 2 ? 'pl-4' : indent <= 4 ? 'pl-8' : 'pl-12';
      return (
        <div key={lineIdx} className={`${indentClass} relative flex items-start gap-2`}>
          <span className={`shrink-0 mt-1 ${isUser ? 'text-white' : 'text-indigo-600'} font-bold`}>
            {listMatch[2].match(/\d+/) ? `${listMatch[2]}` : '•'}
          </span>
          <span className={`leading-relaxed flex-1 ${isUser ? 'text-white' : 'text-gray-800'}`}>
            {processInlineFormatting(content, lineIdx)}
          </span>
        </div>
      );
    }

    // Regular paragraph
    if (line.trim()) {
      return (
        <p key={lineIdx} className={`leading-relaxed ${isUser ? 'text-white' : 'text-gray-800'}`}>
          {processInlineFormatting(line, lineIdx)}
        </p>
      );
    }

    // Empty line
    return <br key={lineIdx} />;
  };

  const processInlineFormatting = (text: string, lineIdx: number): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let partKey = 0;

    // Match all formatting: **bold**, *italic*, or combined
    const formatRegex = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;
    const matches = [...text.matchAll(formatRegex)];

    if (matches.length === 0) {
      return text;
    }

    matches.forEach((match) => {
      const index = match.index!;
      
      // Add text before the match
      if (index > lastIndex) {
        parts.push(text.substring(lastIndex, index));
      }

      // Process the matched formatting
      if (match[1].startsWith('**')) {
        // Bold
        parts.push(
          <strong key={`${lineIdx}-${partKey++}`} className={isUser ? 'text-white' : 'text-gray-900'}>
            {match[2]}
          </strong>
        );
      } else if (match[1].startsWith('*') && !match[1].startsWith('**')) {
        // Italic
        parts.push(
          <em key={`${lineIdx}-${partKey++}`} className={isUser ? 'text-white/90' : 'text-gray-700'}>
            {match[3]}
          </em>
        );
      } else if (match[1].startsWith('`')) {
        // Code
        parts.push(
          <code key={`${lineIdx}-${partKey++}`} className={`px-1.5 py-0.5 rounded text-sm font-mono ${isUser ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-900'}`}>
            {match[4]}
          </code>
        );
      }

      lastIndex = index + match[0].length;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return parts.length > 0 ? parts : text;
  };
  
  return (
    <div className="space-y-1.5 break-words">
      {lines.map((line, idx) => processLine(line, idx))}
    </div>
  );
};

const SimulationPage: React.FC = () => {
  const location = useLocation();
  const [stage, setStage] = useState<'selection' | 'inputs' | 'result'>('selection');
  const [selectedSimulation, setSelectedSimulation] = useState<SimulationTemplate | null>(null);
  const [simulations, setSimulations] = useState<SimulationTemplate[]>([]);
  const [mode, setMode] = useState<SimulationMode | null>(null); // Keep for backward compatibility with existing sessions
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersonas, setSelectedPersonas] = useState<Persona[]>([]);
  const [personaResults, setPersonaResults] = useState<
    Array<{
      personaId: string;
      name: string;
      description?: string;
      avatarUrl?: string;
      content: string;
      thinking?: string;
      retrieval?: RetrievalInfo;
      validation?: ValidationInfo | null;
      pipeline_events?: AgentPipelineEvent[];
    }>
  >([]);
  const [bgInfo, setBgInfo] = useState('');
  const [openingLine, setOpeningLine] = useState('');
  const [stimulusImage, setStimulusImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [inputFields, setInputFields] = useState<Record<string, string>>({});
  const [savedBusinessProfile, setSavedBusinessProfile] = useState<BusinessProfile | null>(null);
  const [businessProfileLoading, setBusinessProfileLoading] = useState(false);
  
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSimulations, setIsLoadingSimulations] = useState(true);
  const [simulationsError, setSimulationsError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const [simulationHistory, setSimulationHistory] = useState<SimulationSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [focusGroups, setFocusGroups] = useState<FocusGroup[]>([]);
  const [selectedFocusGroupId, setSelectedFocusGroupId] = useState<string>('');
  const [surveyGeneratedAnswers, setSurveyGeneratedAnswers] = useState<Record<number, string>>({});
  const [runnerSurveyQuestions, setRunnerSurveyQuestions] = useState<Record<string, SurveyQuestion[]>>({});
  const [persuasionContext, setPersuasionContext] = useState<{
    systemPrompt: string | null;
    fullConversation: string;
    persuasionScore: number | null;
  } | null>(null);
  const [persuasionContextLoading, setPersuasionContextLoading] = useState(false);

  /** When true, the running simulation should stop at next opportunity */
  const simulationCancelledRef = useRef(false);

  /** Activity log: each API call step as it unfolds (for user to watch simulation progress) */
  const [simulationActivityLog, setSimulationActivityLog] = useState<Array<{
    id: string;
    status: 'pending' | 'active' | 'done' | 'error';
    label: string;
    detail?: string;
  }>>([]);

  const [pipelineEvents, setPipelineEvents] = useState<AgentPipelineEvent[]>([]);
  const [pipelineActive, setPipelineActive] = useState(false);
  const [selectedInterviewSampleId, setSelectedInterviewSampleId] = useState<string>('');

  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LEFT);
      if (saved) {
        const n = parseInt(saved, 10);
        if (!isNaN(n) && n >= MIN_LEFT && n <= MAX_LEFT) return n;
      }
    } catch (err) {
      console.warn('Failed to load left panel width:', err);
    }
    return DEFAULT_LEFT;
  });
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RIGHT);
      if (saved) {
        const n = parseInt(saved, 10);
        if (!isNaN(n) && n >= MIN_RIGHT && n <= MAX_RIGHT) return n;
      }
    } catch (err) {
      console.warn('Failed to load right panel width:', err);
    }
    return DEFAULT_RIGHT;
  });

  const updateLeftWidth = (delta: number) => {
    setLeftPanelWidth((w) => {
      const next = Math.max(MIN_LEFT, Math.min(MAX_LEFT, w + delta));
      try {
        localStorage.setItem(STORAGE_KEY_LEFT, String(next));
      } catch (err) {
        console.warn('Failed to save left panel width:', err);
      }
      return next;
    });
  };
  const updateRightWidth = (delta: number) => {
    setRightPanelWidth((w) => {
      const next = Math.max(MIN_RIGHT, Math.min(MAX_RIGHT, w - delta));
      try {
        localStorage.setItem(STORAGE_KEY_RIGHT, String(next));
      } catch (err) {
        console.warn('Failed to save right panel width:', err);
      }
      return next;
    });
  };

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { personas: allPersonas } = useAvailablePersonas();

  const allowedPersonasForSimulation =
    selectedSimulation?.allowed_persona_types?.length
      ? personas.filter((p) => selectedSimulation.allowed_persona_types.includes(p.type))
      : personas;

  const focusGroupsWithAllowedPersonas = useMemo(() => {
    if (!selectedSimulation?.allowed_persona_types?.length) return [];
    const allowedIds = new Set(allowedPersonasForSimulation.map((p) => p.id));
    return focusGroups.filter(
      (g) => g.personaIds.some((pid) => allowedIds.has(pid))
    );
  }, [focusGroups, allowedPersonasForSimulation, selectedSimulation?.allowed_persona_types]);

  const personaCountMin = selectedSimulation?.persona_count_min ?? 1;
  const { user } = useAuth();
  const personaCountMax = selectedSimulation?.persona_count_max ?? 1;
  const usingFocusGroup = selectedFocusGroupId.length > 0;
  const selectedPersona = selectedPersonas[0] ?? null;
  const runnerDisplayName = getRunnerDisplayName(user?.username);
  const stablePersonaFallback = getStablePersonaFallbackName();
  const requiredBusinessProfileMissing = Boolean(
    selectedSimulation?.required_input_fields?.some((f) =>
      (f.type === 'business_profile' || f.name === 'businessProfile') && f.required
    ) &&
    !businessProfileLoading &&
    !savedBusinessProfile
  );

  // Load simulations on mount
  useEffect(() => {
    const loadSimulations = async () => {
      setIsLoadingSimulations(true);
      setSimulationsError(null);
      try {
        const sims = await simulationTemplateApi.getAll();
        setSimulations(sims);
      } catch (error) {
        console.error('Failed to load simulations:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to load simulations';
        setSimulationsError(errorMessage);
      } finally {
        setIsLoadingSimulations(false);
      }
    };
    loadSimulations();
  }, []);

  useEffect(() => {
    if (selectedSimulation) {
      focusGroupApi.getAll().then(setFocusGroups).catch(() => setFocusGroups([]));
    }
  }, [selectedSimulation]);

  // Save messages to localStorage when they change
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      localStorage.setItem(`simulationMessages_${currentSessionId}`, JSON.stringify(messages));
    }
  }, [messages, currentSessionId]);

  // Save active session to localStorage
  useEffect(() => {
    if (currentSessionId) {
      localStorage.setItem('simulationActiveSessionId', currentSessionId);
    } else {
      localStorage.removeItem('simulationActiveSessionId');
    }
  }, [currentSessionId]);

  // Fetch persuasion context (system prompt, full conversation, score) via separate API when viewing persuasion result
  useEffect(() => {
    const isPersuasion =
      stage === 'result' &&
      selectedSimulation?.simulation_type === 'persuasion_simulation' &&
      currentSessionId;
    if (!isPersuasion) {
      setPersuasionContext(null);
      return;
    }
    let cancelled = false;
    setPersuasionContextLoading(true);
    simulationApi
      .getPersuasionContext(currentSessionId)
      .then(async (data) => {
        if (cancelled) return;
        const apiScore = coerceSinglePersuasionScore(data.persuasionScore);
        const normalized = { ...data, persuasionScore: apiScore };
        if (apiScore != null) {
          setPersuasionContext(normalized);
          return;
        }
        if (data.fullConversation?.trim()) {
          try {
            const score = await geminiService.computePersuasionScore(data.fullConversation);
            if (!cancelled) {
              setPersuasionContext({ ...normalized, persuasionScore: score });
            }
          } catch (err) {
            console.warn('Failed to compute persuasion score on load:', err);
            if (!cancelled) setPersuasionContext(normalized);
          }
        } else {
          setPersuasionContext(normalized);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPersuasionContext(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPersuasionContextLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stage, selectedSimulation?.simulation_type, currentSessionId, messages.length]);

  useEffect(() => {
    setPersonas(allPersonas);
    loadHistory();
  }, [allPersonas]);

  useEffect(() => {
    if (stage !== 'inputs' || !selectedSimulation) return;
    const allowed = selectedSimulation.allowed_persona_types;
    if (allowed?.length) {
      setSelectedPersonas(prev => prev.filter(p => allowed.includes(p.type)));
    }
  }, [selectedSimulation, stage, personas]);

  const hasBusinessProfileField = selectedSimulation?.required_input_fields?.some(
    (f) => f.type === 'business_profile' || f.name === 'businessProfile'
  );
  useEffect(() => {
    if (!hasBusinessProfileField) {
      setSavedBusinessProfile(null);
      return;
    }
    let cancelled = false;
    setBusinessProfileLoading(true);
    getBusinessProfile()
      .then((p) => { if (!cancelled) setSavedBusinessProfile(p ?? null); })
      .finally(() => { if (!cancelled) setBusinessProfileLoading(false); });
    return () => { cancelled = true; };
  }, [hasBusinessProfileField]);

  // Restore last active simulation session after history is loaded
  useEffect(() => {
    const restoreSession = async () => {
      const savedSessionId = localStorage.getItem('simulationActiveSessionId');
      if (savedSessionId && allPersonas.length > 0 && simulationHistory.length > 0 && !currentSessionId) {
        const savedSession = simulationHistory.find(s => s.id === savedSessionId);
        if (savedSession) {
          // Use the resumeSimulation function defined below
          setIsLoading(true);
          setCurrentSessionId(savedSession.id);
          setMode(savedSession.mode);
          setBgInfo(savedSession.bgInfo);
          setOpeningLine(savedSession.openingLine || '');
          setStimulusImage(savedSession.stimulusImage || null);
          setMimeType(savedSession.mimeType || null);
          
          const persona = allPersonas.find(p => p.id === savedSession.personaId);
          setSelectedPersonas(persona ? [persona] : []);

          // Load messages from localStorage
          try {
            const savedMessages = localStorage.getItem(`simulationMessages_${savedSession.id}`);
            if (savedMessages) {
              const parsed = JSON.parse(savedMessages);
              setMessages(parsed);
            } else {
              setMessages([]);
            }
          } catch (err) {
            console.error('Failed to load messages from localStorage:', err);
            setMessages([]);
          }
          
          setStage('result');
          setIsLoading(false);
        }
      }
    };
    restoreSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simulationHistory, allPersonas]);

  const loadHistory = async () => {
    try {
      const history = await simulationApi.getAll();
      // Normalize dates
      const normalized = history.map(s => ({
        ...s,
        createdAt: s.created_at || s.createdAt,
        personaId: s.persona_id || s.personaId,
        personaIds: s.persona_ids ?? s.personaIds,
        bgInfo: s.bg_info || s.bgInfo,
        openingLine: s.opening_line || s.openingLine,
        stimulusImage: s.stimulus_image || s.stimulusImage,
        mimeType: s.mime_type || s.mimeType,
      }));
      setSimulationHistory(normalized.sort((a, b) => {
        const dateA = a.createdAt || '';
        const dateB = b.createdAt || '';
        return dateB.localeCompare(dateA);
      }));
    } catch (err) {
      console.error('Failed to load simulation history:', err);
    }
  };

  useEffect(() => {
    if (stage === 'result') {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, stage]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [chatInput]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMimeType(file.type);
      const reader = new FileReader();
      reader.onload = (ev) => setStimulusImage(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const startSimulation = async () => {
    // Validate all required fields before starting
    if (!selectedSimulation) {
      alert('Please select a simulation');
      return;
    }

    const minP = selectedSimulation.persona_count_min ?? 1;
    const maxP = selectedSimulation.persona_count_max ?? 1;
    if (selectedPersonas.length < minP) {
      alert(`Please select at least ${minP} persona${minP > 1 ? 's' : ''}.`);
      return;
    }
    if (!usingFocusGroup && selectedPersonas.length > maxP) {
      alert(`Please select at most ${maxP} persona${maxP > 1 ? 's' : ''}.`);
      return;
    }

    const typeConfig = selectedSimulation.type_specific_config || {};
    const isGeneratedSurvey = selectedSimulation.simulation_type === 'survey' && typeConfig.survey_mode === 'generated';
    const surveyQuestions = (typeConfig.survey_questions as SurveyQuestion[]) || [];

    // Generated survey: no runner answers required; persona answers the questions.
    if (!isGeneratedSurvey || surveyQuestions.length === 0) {
      // Validate required input fields (runner input fields)
      for (const field of selectedSimulation.required_input_fields) {
        if (!field.required) continue;
        if (field.type === 'business_profile' || field.name === 'businessProfile') {
          if (!savedBusinessProfile) {
            alert('This simulation needs your business background. Add it in Settings → Business background, then try again.');
            return;
          }
        } else if (field.type === 'survey_questions') {
          const qs = runnerSurveyQuestions[field.name] || [];
          if (qs.length === 0 || qs.some((q) => !q.question.trim())) {
            alert(`Please add at least one question with text for: ${field.name}`);
            return;
          }
          for (let i = 0; i < qs.length; i++) {
            if (qs[i].type === 'multiple_choice' && (!qs[i].options || qs[i].options!.filter(Boolean).length === 0)) {
              alert(`Question ${i + 1} in "${field.name}" (multiple choice) must have at least one option`);
              return;
            }
          }
        } else if (!inputFields[field.name]?.trim()) {
          alert(`Please fill in the required field: ${field.name}`);
          return;
        }
      }
    }
    
    simulationCancelledRef.current = false;
    setIsLoading(true);
    setSimulationActivityLog([]);
    setPersonaResults([]);
    setMessages([]);
    setPipelineEvents([]);
    setPipelineActive(true);
    setStage('result');

    const addActivity = (label: string, detail?: string) => {
      const id = crypto.randomUUID();
      setSimulationActivityLog((prev) => [...prev, { id, status: 'active', label, detail }]);
      return id;
    };
    const markActivityDone = (id: string) => {
      setSimulationActivityLog((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: 'done' as const } : a))
      );
    };
    const markActivityError = (id: string) => {
      setSimulationActivityLog((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: 'error' as const } : a))
      );
    };

    const fieldMap: Record<string, string> = {
      bgInfo: bgInfo,
      ...inputFields,
    };
    // Inject runner-created survey questions into fieldMap
    if (selectedSimulation.required_input_fields) {
      for (const field of selectedSimulation.required_input_fields) {
        if (field.type !== 'survey_questions') continue;
        const qs = runnerSurveyQuestions[field.name] || [];
        if (qs.length > 0) {
          const formatted = qs.map((q, i) => {
            let line = `${i + 1}. [${q.type}] ${q.question}`;
            if (q.type === 'multiple_choice' && q.options?.length) {
              line += `\n   Options: ${q.options.filter(Boolean).join(', ')}`;
            }
            return line;
          }).join('\n');
          fieldMap[field.name] = formatted;
        }
      }
    }
    // Inject saved business profile for any business_profile input fields
    if (savedBusinessProfile && selectedSimulation.required_input_fields) {
      for (const field of selectedSimulation.required_input_fields) {
        if (field.type === 'business_profile' || field.name === 'businessProfile') {
          fieldMap[field.name] = businessProfileToPromptString(savedBusinessProfile);
        }
      }
    }
    // Build user inputs string for {{OPENING_LINE}}: all user-provided values except bgInfo (which is {{BACKGROUND_INFO}})
    const buildUserInputsString = (map: Record<string, string>, fields?: { name: string }[]) => {
      const entries = Object.entries(map).filter(([k, v]) => k !== 'bgInfo' && v != null && String(v).trim() !== '');
      if (entries.length === 0) return '';
      const getLabel = (name: string) => fields?.find(f => f.name === name)?.name ?? name;
      return entries.map(([k, v]) => `${getLabel(k)}: ${String(v).trim()}`).join('\n');
    };
    const userInputsString = buildUserInputsString(fieldMap, selectedSimulation?.required_input_fields);

    // Generated survey: persona answers the questions; no runner answers to inject.

    // If no top-level stimulus file, use first file-upload field (pdf type) as inline attachment
    let effectiveStimulusImage: string | undefined = stimulusImage || undefined;
    let effectiveMimeType: string | undefined = mimeType || undefined;
    if (!effectiveStimulusImage && selectedSimulation.required_input_fields) {
      for (const field of selectedSimulation.required_input_fields) {
        if (field.type !== 'pdf') continue;
        const val = fieldMap[field.name];
        if (!val || typeof val !== 'string') continue;
        const dataUrlMatch = val.match(/^data:([^;]+);base64,(.+)$/);
        if (dataUrlMatch) {
          const parsedMime = dataUrlMatch[1].trim().toLowerCase();
          const base64 = dataUrlMatch[2];
          if (base64 && parsedMime) {
            effectiveStimulusImage = val;
            effectiveMimeType = parsedMime;
            fieldMap[field.name] = '[Attached file provided]';
          }
          break;
        }
      }
    }

    // --- Persona v Persona conversation flow ---
    if (selectedSimulation.simulation_type === 'persona_conversation') {
      const openingLineText = userInputsString || fieldMap.bgInfo || 'No opening line provided.';
      const conversationBaseInstructions = (() => {
        if (selectedSimulation.system_prompt) {
          let instr = selectedSimulation.system_prompt
            .replace(/{{BACKGROUND_INFO}}/g, fieldMap.bgInfo || bgInfo || '')
            .replace(/{{OPENING_LINE}}/g, openingLineText);
          for (const [key, value] of Object.entries(fieldMap)) {
            instr = instr.replace(new RegExp(`{{${key.toUpperCase()}}}`, 'g'), value || '');
          }
          return instr;
        }
        return `You are in a moderated conversation. The opening topic is:\n"${openingLineText.substring(0, 1500)}"\n\nFocus on the opening topic—not your own organization or story. Use your profile to inform your perspective. Respond in character. Stay concise; this is one turn in a discussion.`;
      })();
      try {
        let sessionMode: SimulationMode = 'web_page';
        const modeTitle = selectedSimulation.title.toLowerCase();
        if (modeTitle.includes('marketing')) sessionMode = 'marketing';
        else if (modeTitle.includes('sales')) sessionMode = 'sales_pitch';
        else if (modeTitle.includes('investor')) sessionMode = 'investor_pitch';

        const sessionName =
          selectedPersonas.length >= 2
            ? `${selectedPersonas[0].name} & ${selectedPersonas[1].name}${selectedPersonas.length > 2 ? ` +${selectedPersonas.length - 2}` : ''} - ${selectedSimulation.title}`
            : `${selectedPersonas[0].name} - ${selectedSimulation.title}`;

        const newSession = await simulationApi.create({
          personaIds: selectedPersonas.map((p) => p.id),
          personaId: selectedPersonas[0].id,
          mode: sessionMode,
          bgInfo: fieldMap.bgInfo?.trim() || bgInfo.trim() || '',
          openingLine: openingLineText,
          stimulusImage: effectiveStimulusImage || undefined,
          mimeType: effectiveMimeType || undefined,
          name: sessionName,
        });
        const newSessionId = newSession.id;
        setCurrentSessionId(newSessionId);
        setMessages([]);
        loadHistory();

        const personaList = selectedPersonas.map((p) => ({ id: p.id, name: p.name }));
        const personaWithFiles: Persona[] = [];
        for (const p of selectedPersonas) {
          if (simulationCancelledRef.current) return;
          const idLoad = addActivity(`Loading blueprint for ${p.name}...`);
          try {
            const files = p.files?.length ? p.files : await personaApi.getFiles(p.id).then((fs) => fs.map((f) => ({ ...f, content: f.content, name: f.name })));
            personaWithFiles.push({ ...p, files });
          } finally {
            markActivityDone(idLoad);
          }
        }
        if (simulationCancelledRef.current) return;
        const personaMap = new Map<string, Persona>(personaWithFiles.map((p) => [p.id, p]));

        const getPersonaProfile = (persona: Persona): string => {
          let profileData = `NAME: ${persona.name}\nDESCRIPTION: ${persona.description}\n\nCORE BLUEPRINT FILES:\n`;
          const files = persona.files || [];
          for (const f of files) {
            profileData += `--- FILE: ${f.name} ---\n${(f.content || '').substring(0, 15000)}\n\n`;
          }
          return profileData;
        };

        let firstSpeakerId: string;
        const idChooseFirst = addActivity('Choosing first speaker...');
        try {
          firstSpeakerId = await geminiService.moderatorWhoSpeaksFirst(openingLineText, personaList);
          markActivityDone(idChooseFirst);
        } catch (err: unknown) {
          markActivityError(idChooseFirst);
          const msg = err instanceof Error ? err.message : String(err);
          throw new Error(`Moderator could not choose first speaker: ${msg}`);
        }
        if (simulationCancelledRef.current) return;
        const firstSpeaker = personaMap.get(firstSpeakerId) || personaWithFiles[0];
        if (!firstSpeaker) {
          firstSpeakerId = selectedPersonas[0].id;
        }
        let nextSpeakerId: string = firstSpeaker?.id ?? selectedPersonas[0].id;

        let turnCount = 0;
        const maxTurns =
          typeof selectedSimulation.type_specific_config?.max_persona_turns === 'number'
            ? Math.min(50, Math.max(1, selectedSimulation.type_specific_config.max_persona_turns))
            : MAX_PERSONA_TURNS;
        const conversationMessages: Message[] = [];
        const lastThinkingByPersona = new Map<string, string>();

        while (turnCount < maxTurns) {
        const currentSpeaker = personaMap.get(nextSpeakerId) || personaWithFiles[0];
        const historyForChat = conversationMessages
            .filter((m) => m.senderType === 'persona' && m.personaId)
            .map((m) => {
              const name = getPersonaDisplayName(personaMap.get(m.personaId!));
              return { role: 'user' as const, text: `${name}: ${m.content}` };
            });
          const turnMessage =
            conversationMessages.length === 0
              ? `The opening topic is: "${openingLineText.substring(0, 1000)}". You are starting the conversation. Share your thoughts in character.`
              : `It's your turn. Respond in character to the discussion so far.`;

          const speakerName = getPersonaDisplayName(currentSpeaker);
          const idPersonaTurn = addActivity(`${speakerName} is responding...`, `Turn ${turnCount + 1}`);
          let response: string;
          let turnThinking: string | undefined;
          let turnPipelineMeta: Pick<Message, 'thinking' | 'retrieval_summary' | 'validation'> = {};
          const turnCollected: AgentPipelineEvent[] = [];
          let agentTurnResult: Awaited<ReturnType<typeof agentApi.turnStream>>;
          try {
            setPipelineEvents([]);
            setPipelineActive(true);
            agentTurnResult = await agentApi.turnStream({
              personaId: currentSpeaker.id,
              personaIds: selectedPersonas.map(p => p.id),
              sessionId: newSessionId,
              history: historyForChat,
              userMessage: turnMessage,
              simulationInstructions: conversationBaseInstructions
                .replace(/{{SELECTED_PROFILE}}/g, currentSpeaker.name)
                .replace(/{{SELECTED_PROFILE_FULL}}/g, `[Your profile for ${currentSpeaker.name} — retrieved automatically from knowledge base]`),
              coachContext: {
                background_info: fieldMap.bgInfo || bgInfo || null,
                opening_line: openingLineText || null,
              },
              previousThinking: lastThinkingByPersona.get(currentSpeaker.id),
            }, (ev) => {
              turnCollected.push(ev);
              setPipelineEvents((prev) => [...prev, ev]);
            });
            setPipelineActive(false);
            response = agentTurnResult.response;
            turnThinking = agentTurnResult.thinking || undefined;
            turnPipelineMeta = messageMetadataFromAgentTurn(agentTurnResult);
            if (turnThinking) lastThinkingByPersona.set(currentSpeaker.id, turnThinking);
            markActivityDone(idPersonaTurn);
          } catch (err) {
            setPipelineActive(false);
            markActivityError(idPersonaTurn);
            throw err;
          }
          if (simulationCancelledRef.current) return;
          const pipelineEventsForMsg = finalizePipelineEvents(turnCollected, agentTurnResult);
          const personaMsg: Message = {
            id: crypto.randomUUID(),
            sessionId: newSessionId,
            senderType: 'persona',
            personaId: currentSpeaker.id,
            content: response,
            createdAt: new Date().toISOString(),
            ...turnPipelineMeta,
            pipeline_events: pipelineEventsForMsg,
          };
          conversationMessages.push(personaMsg);
          setMessages([...conversationMessages]);
          turnCount++;

          if (turnCount >= maxTurns) break;

          const conversationForModerator = conversationMessages
            .filter((m) => m.senderType === 'persona' && m.personaId)
            .map((m) => ({
              speakerName: getPersonaDisplayName(personaMap.get(m.personaId!)),
              content: m.content,
            }));
          const idModeratorNext = addActivity('Moderator deciding next speaker...');
          let nextOrEnd: { action: 'NEXT' | 'END'; persona_id?: string };
          try {
            nextOrEnd = await geminiService.moderatorNextOrEnd(
              openingLineText,
              personaList,
              conversationForModerator,
              turnCount,
              maxTurns
            );
            markActivityDone(idModeratorNext);
          } catch (err) {
            markActivityError(idModeratorNext);
            throw err;
          }
          if (simulationCancelledRef.current) return;
          if (nextOrEnd.action === 'END') break;
          nextSpeakerId = nextOrEnd.persona_id!;
        }

        const conversationForSummary = conversationMessages
          .filter((m) => m.senderType === 'persona' && m.personaId)
          .map((m) => ({
            speakerName: getPersonaDisplayName(personaMap.get(m.personaId!)),
            content: m.content,
          }));
        const idSummarize = addActivity('Moderator summarizing conversation...');
        let summary: string;
        try {
          summary = await geminiService.moderatorSummarize(openingLineText, conversationForSummary);
          markActivityDone(idSummarize);
        } catch (err) {
          markActivityError(idSummarize);
          throw err;
        }
        if (simulationCancelledRef.current) return;
        const moderatorMsg: Message = {
          id: crypto.randomUUID(),
          sessionId: newSessionId,
          senderType: 'moderator',
          content: summary,
          createdAt: new Date().toISOString(),
        };
        conversationMessages.push(moderatorMsg);
        setMessages([...conversationMessages]);

        localStorage.setItem(`simulationMessages_${newSessionId}`, JSON.stringify(conversationMessages));
        localStorage.setItem(`simulationPersonas_${newSessionId}`, JSON.stringify(selectedPersonas));
        try {
          await simulationApi.createMessagesBulk(
            newSessionId,
            conversationMessages.map((m) => ({
              sender_type: m.senderType,
              persona_id: m.personaId,
              content: m.content,
              thinking: m.thinking ?? null,
              retrieval_summary: m.retrieval_summary ?? null,
              validation: m.validation ?? null,
            }))
          );
        } catch (err) {
          console.warn('Failed to sync persona conversation messages to backend:', err);
        }
        setStage('result');
        loadHistory();
      } catch (err: unknown) {
        console.error('Persona conversation error:', err);
        const errorMessage = err instanceof Error ? err.message : String(err);
        alert(
          `Persona conversation failed: ${errorMessage}`
        );
      } finally {
        setIsLoading(false);
        setPipelineActive(false);
      }
      return;
    }

    const results: Array<{
      personaId: string;
      name: string;
      description?: string;
      avatarUrl?: string;
      content: string;
      thinking?: string;
      retrieval?: RetrievalInfo;
      validation?: ValidationInfo | null;
      pipeline_events?: AgentPipelineEvent[];
    }> = [];

    let persuasionSystemPrompt: string | null = null;

    for (const selectedPersona of selectedPersonas) {
      if (simulationCancelledRef.current) return;

      let instructions = selectedSimulation.system_prompt;
      const hasRequiredInputs = (selectedSimulation.required_input_fields?.length ?? 0) > 0;
      if (hasRequiredInputs && !/Focus of this simulation/i.test(instructions)) {
        instructions =
          '### Focus of this simulation\nThe **focus** of your response is always the **user\'s inputs**—the content provided by the **person running the simulation** (the user), not by the persona. Use your profile to inform your perspective and assist in decision-making, but center your analysis and recommendations on the **user\'s situation and inputs**. Do not center the response on your own organization or story.\n\n' +
          instructions;
      }
      const hasBusinessProfileField = selectedSimulation.required_input_fields?.some(
        (f) => f.type === 'business_profile' || f.name === 'businessProfile'
      );
      if (hasBusinessProfileField && !/Business to analyze/i.test(instructions)) {
        instructions =
          '### Business to analyze (client company)\nThe business profile below describes the **client\'s (user\'s) business**—input from the **person running the simulation**, not the persona. Base your analysis exclusively on this business, not on your own organization.\n\n' +
          instructions;
      }
      const hasSurveyQuestionsField = selectedSimulation.required_input_fields?.some(
        (f) => f.type === 'survey_questions'
      );
      if (hasSurveyQuestionsField && !/Survey questions provided by the runner/i.test(instructions)) {
        const sqFieldNames = selectedSimulation.required_input_fields
          .filter((f) => f.type === 'survey_questions')
          .map((f) => `{{${f.name.toUpperCase()}}}`)
          .join(', ');
        instructions =
          `### Survey questions provided by the runner\nThe variable(s) ${sqFieldNames} contain survey questions created by the person running the simulation. Each question includes its type (text, numeric, or multiple_choice) and, for multiple choice, the available options. You must answer every question listed, using the question type to determine the format of your answer.\n\n` +
          instructions;
      }
      instructions = instructions
        .replace(/{{SELECTED_PROFILE}}/g, selectedPersona.name)
        .replace(/{{SELECTED_PROFILE_FULL}}/g, `[Your profile for ${selectedPersona.name} — retrieved automatically from knowledge base]`)
        .replace(/{{BACKGROUND_INFO}}/g, fieldMap.bgInfo || bgInfo || '')
        .replace(/{{OPENING_LINE}}/g, userInputsString || '');
      for (const [key, value] of Object.entries(fieldMap)) {
        instructions = instructions.replace(new RegExp(`{{${key.toUpperCase()}}}`, 'g'), value || '');
      }

      if (selectedSimulation.simulation_type === 'persuasion_simulation' && selectedPersona.id === selectedPersonas[0].id) {
        persuasionSystemPrompt = instructions;
      }

      const idPersonaSim = addActivity(`Generating response for ${selectedPersona.name}...`);
      let result: string;
      let resultThinking: string | undefined;
      let resultRetrieval: RetrievalInfo | undefined;
      let resultValidation: ValidationInfo | null | undefined;
      const batchCollected: AgentPipelineEvent[] = [];
      let batchAgentResult: Awaited<ReturnType<typeof agentApi.turnStream>>;
      try {
        setPipelineEvents([]);
        setPipelineActive(true);
        batchAgentResult = await agentApi.turnStream(
          {
            personaId: selectedPersona.id,
            personaIds: selectedPersonas.map((p) => p.id),
            history: [],
            userMessage:
              userInputsString || fieldMap.bgInfo || bgInfo || 'Please respond based on the simulation instructions.',
            simulationInstructions: instructions,
            coachContext: {
              opportunity_name: fieldMap.opportunityName || null,
              opportunity_stage: fieldMap.opportunityStage || null,
              key_stakeholders: fieldMap.keyStakeholders || null,
              top_objections: fieldMap.topObjections || null,
              key_risks: fieldMap.keyRisks || null,
              desired_outcome: fieldMap.desiredOutcome || null,
              meeting_type: fieldMap.meetingType || null,
              transcript_summary: fieldMap.transcriptSummary || null,
              sales_method: fieldMap.salesMethod || null,
              background_info: fieldMap.bgInfo || bgInfo || null,
              opening_line: userInputsString || null,
            },
            image: effectiveStimulusImage || undefined,
            mimeType: effectiveMimeType || undefined,
          },
          (ev) => {
            batchCollected.push(ev);
            setPipelineEvents((prev) => [...prev, ev]);
          }
        );
        setPipelineActive(false);
        result = batchAgentResult.response;
        resultThinking = batchAgentResult.thinking || undefined;
        resultRetrieval = batchAgentResult.retrieval;
        resultValidation = batchAgentResult.validation;
        markActivityDone(idPersonaSim);
      } catch (err) {
        setPipelineActive(false);
        markActivityError(idPersonaSim);
        throw err;
      }
      if (simulationCancelledRef.current) return;
      const pipelineForPersona = finalizePipelineEvents(batchCollected, batchAgentResult);
      results.push({
        personaId: selectedPersona.id,
        name: selectedPersona.name,
        description: selectedPersona.description,
        avatarUrl: selectedPersona.avatarUrl,
        content: result,
        thinking: resultThinking,
        retrieval: resultRetrieval,
        validation: resultValidation,
        pipeline_events: pipelineForPersona,
      });
    }

    if (simulationCancelledRef.current) return;
    setPersonaResults(results);

    const firstPersona = selectedPersonas[0];
    if (!firstPersona?.id) throw new Error('Persona ID is missing');

    try {
      // Determine mode for backward compatibility (use first 4 chars of simulation title or default)
      let sessionMode: SimulationMode = 'web_page';
      const modeTitle = selectedSimulation.title.toLowerCase();
      if (modeTitle.includes('marketing')) sessionMode = 'marketing';
      else if (modeTitle.includes('sales')) sessionMode = 'sales_pitch';
      else if (modeTitle.includes('investor')) sessionMode = 'investor_pitch';
      
      const newSession = await simulationApi.create({
        personaId: firstPersona.id,
        mode: sessionMode,
        bgInfo: fieldMap.bgInfo?.trim() || bgInfo.trim() || '',
        openingLine: userInputsString || undefined,
        stimulusImage: effectiveStimulusImage || undefined,
        mimeType: effectiveMimeType || undefined,
        name: `${firstPersona.name} - ${selectedSimulation.title}`,
        ...(persuasionSystemPrompt != null ? { systemPrompt: persuasionSystemPrompt } : {}),
      });
      
      const newSessionId = newSession.id;

      // Index session context so follow-up agent turns can load full simulation inputs as documents
      const sessionContextFields: Record<string, string> = {};
      if (fieldMap.bgInfo || bgInfo) sessionContextFields.bgInfo = fieldMap.bgInfo || bgInfo;
      if (userInputsString) sessionContextFields.openingLine = userInputsString;
      for (const [key, value] of Object.entries(fieldMap)) {
        if (value && key !== 'bgInfo') sessionContextFields[key] = value;
      }
      if (Object.keys(sessionContextFields).length > 0) {
        agentApi.indexContext(newSessionId, sessionContextFields).catch(err =>
          console.warn('Failed to index session context:', err)
        );
      }

      const initialMessage: Message = {
        id: crypto.randomUUID(),
        sessionId: newSessionId,
        senderType: 'persona',
        personaId: firstPersona.id,
        content: results[0].content,
        createdAt: new Date().toISOString(),
        ...messageMetadataFromAgentTurn({
          thinking: results[0].thinking,
          retrieval: results[0].retrieval,
          validation: results[0].validation,
        }),
        pipeline_events: results[0].pipeline_events,
      };
      
      setCurrentSessionId(newSessionId);
      setMessages([initialMessage]);
      setStage('result');
      loadHistory();

      localStorage.setItem(`simulationPersonaResults_${newSessionId}`, JSON.stringify(results));

      try {
        await simulationApi.createMessagesBulk(newSessionId, results.map(personaResultToApiRow));
      } catch (err) {
        console.warn('Failed to sync simulation agent messages to backend:', err);
      }

      if (selectedSimulation.simulation_type === 'persuasion_simulation') {
        // Compute persuasion score via LLM so sidebar shows a value
        try {
          const conversationText = `Persona: ${results[0].content}`;
          const score = await geminiService.computePersuasionScore(conversationText);
          setPersuasionContext(prev => ({
            systemPrompt: prev?.systemPrompt ?? null,
            fullConversation: conversationText,
            persuasionScore: score,
          }));
        } catch (err) {
          console.warn('Failed to compute persuasion score:', err);
        }
      }
      
      if (isGeneratedSurvey && surveyQuestions.length > 0) {
        localStorage.setItem(`simulationSurveyData_${newSessionId}`, JSON.stringify({
          questions: surveyQuestions,
          answers: {}, // Generated: persona answers in result content; no runner answers.
          respondentName: firstPersona.name,
        }));
      }
      
      const personaWithFiles = {
        ...firstPersona,
        files: firstPersona.files || [],
      };
      if (personaWithFiles.files.length === 0) {
        try {
          const files = await personaApi.getFiles(firstPersona.id);
          personaWithFiles.files = files.map(f => ({
            ...f,
            createdAt: f.created_at || f.createdAt,
          }));
        } catch (err) {
          console.error('Failed to load persona files:', err);
        }
      }
      localStorage.setItem(`simulationPersona_${newSessionId}`, JSON.stringify(personaWithFiles));
    } catch (err: any) {
      console.error('Simulation error:', err);
      const errorMessage = err?.message || err?.toString() || 'Unknown error occurred';
      alert(`Simulation failed: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadInterviewSample = (sampleId: string) => {
    const sample = interviewSamples.find((s) => s.id === sampleId);
    if (!sample) return;
    setSelectedInterviewSampleId(sampleId);
    setOpeningLine(sample.userMessage);
    const nextInputs = { ...inputFields };
    const fieldAliases: Record<string, string[]> = {
      bgInfo: ['transcript_summary'],
      opportunityStage: ['opportunity_stage'],
      opportunityName: ['opportunity_name'],
      keyStakeholders: ['key_stakeholders'],
      topObjections: ['top_objections'],
      keyRisks: ['key_risks'],
      desiredOutcome: ['desired_outcome'],
      meetingType: ['meeting_type'],
      transcriptSummary: ['transcript_summary'],
      salesMethod: ['sales_method'],
    };
    for (const field of selectedSimulation?.required_input_fields ?? []) {
      const aliases = fieldAliases[field.name] || [field.name];
      const value = aliases.map((k) => sample.coachContext[k]).find(Boolean);
      if (value) nextInputs[field.name] = value;
    }
    if (!nextInputs.bgInfo && sample.coachContext.transcript_summary) {
      nextInputs.bgInfo = sample.coachContext.transcript_summary;
    }
    setBgInfo(nextInputs.bgInfo || bgInfo);
    setInputFields(nextInputs);
    setChatInput(sample.userMessage);
  };

  function extractTalkTrack(content: string): string {
    const match = content.match(/Recommended talk track:\s*([\s\S]*?)\n\nNext question:/i);
    if (match && match[1]) return match[1].trim();
    return content.trim();
  }

  async function copyTalkTrack(content: string) {
    const text = extractTalkTrack(content);
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.warn('Failed to copy talk track:', err);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sampleId = params.get('sample');
    if (!sampleId) return;
    if (selectedInterviewSampleId === sampleId) return;
    if (!selectedSimulation) return;
    if (stage !== 'inputs') return;
    loadInterviewSample(sampleId);
  }, [location.search, stage, selectedSimulation, selectedInterviewSampleId]);

  const handleSendFollowUp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || !selectedPersona || isTyping || !currentSessionId) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      sessionId: currentSessionId,
      senderType: 'user',
      content: chatInput,
      createdAt: new Date().toISOString()
    };

    const currentInput = chatInput;
    setMessages(prev => [...prev, userMsg]);
    // Note: Messages are stored locally for simulations
    // In production, you might want to create a chat session for each simulation
    setChatInput('');
    setIsTyping(true);

    try {
      // Build history from current messages + the new user message
      const history = [...messages, userMsg].map(m => ({
        role: m.senderType === 'user' ? 'user' as const : 'model' as const,
        text: m.content
      }));

      const lastPersonaThinking = [...messages].reverse().find(m => m.senderType === 'persona' && m.thinking)?.thinking;
      const followUpCollected: AgentPipelineEvent[] = [];
      setPipelineEvents([]);
      setPipelineActive(true);
      const agentResult = await agentApi.turnStream(
        {
          personaId: selectedPersona.id,
          personaIds: [selectedPersona.id],
          sessionId: currentSessionId,
          history,
          userMessage: currentInput,
          simulationInstructions: bgInfo ? `Context provided by the person running the simulation: ${bgInfo}` : undefined,
          coachContext: {
            background_info: bgInfo || null,
            opening_line: openingLine || null,
          },
          previousThinking: lastPersonaThinking,
        },
        (ev) => {
          followUpCollected.push(ev);
          setPipelineEvents((prev) => [...prev, ev]);
        }
      );
      setPipelineActive(false);
      const response = agentResult.response;
      const followUpMeta = messageMetadataFromAgentTurn(agentResult);
      const followUpPipeline = finalizePipelineEvents(followUpCollected, agentResult);

      const aiMsg: Message = {
        id: crypto.randomUUID(),
        sessionId: currentSessionId,
        senderType: 'persona',
        personaId: selectedPersona.id,
        content: response,
        createdAt: new Date().toISOString(),
        ...followUpMeta,
        pipeline_events: followUpPipeline,
      };

      setMessages(prev => [...prev, aiMsg]);
      // Sync follow-up turns to backend (persuasion workspace); include full agent trace on the persona reply
      if (currentSessionId && selectedSimulation?.simulation_type === 'persuasion_simulation') {
        try {
          await simulationApi.createMessagesBulk(currentSessionId, [
            { sender_type: 'user', content: userMsg.content },
            {
              sender_type: 'persona',
              persona_id: selectedPersona.id,
              content: aiMsg.content,
              thinking: aiMsg.thinking ?? null,
              retrieval_summary: aiMsg.retrieval_summary ?? null,
              validation: aiMsg.validation ?? null,
            },
          ]);
        } catch (err) {
          console.warn('Failed to sync persuasion messages to backend:', err);
        }
        // Compute persuasion score via LLM after each response so sidebar shows a value
        try {
          const conversationLines = [...messages, userMsg, aiMsg].map(m =>
            m.senderType === 'user' ? `User: ${m.content}` : `Persona: ${m.content}`
          );
          const conversationText = conversationLines.join('\n\n');
          const score = await geminiService.computePersuasionScore(conversationText);
          setPersuasionContext(prev => ({
            systemPrompt: prev?.systemPrompt ?? null,
            fullConversation: conversationText,
            persuasionScore: score,
          }));
        } catch (err) {
          console.warn('Failed to compute persuasion score:', err);
        }
      }
      // Messages are saved to localStorage via useEffect
    } catch (err: any) {
      console.error('Chat error:', err);
      setPipelineActive(false);
      const errorMessage = err?.message || err?.toString() || 'Unknown error occurred';
      alert(`Failed to send message: ${errorMessage}`);
    } finally {
      setIsTyping(false);
    }
  };

  const resumeSimulation = async (session: SimulationSession) => {
    setIsLoading(true);
    setCurrentSessionId(session.id);
    setMode(session.mode);
    setBgInfo(session.bgInfo);
    setOpeningLine(session.openingLine || '');
    setStimulusImage(session.stimulusImage || null);
    setMimeType(session.mimeType || null);

    const personaIds = session.personaIds ?? session.persona_ids;
    if (personaIds && Array.isArray(personaIds) && personaIds.length > 1) {
      let restoredPersonas: Persona[] = [];
      const cached = localStorage.getItem(`simulationPersonas_${session.id}`);
      if (cached) {
        try {
          restoredPersonas = JSON.parse(cached);
        } catch (err) {
          console.error('Failed to parse cached personas:', err);
        }
      }
      if (restoredPersonas.length < personaIds.length) {
        for (const id of personaIds) {
          if (restoredPersonas.some((p) => p.id === id)) continue;
          const p = personas.find((x) => x.id === id);
          if (p) restoredPersonas.push(p);
          else {
            try {
              const fetched = await personaApi.getById(id);
              const withFiles = { ...fetched, avatarUrl: fetched.avatar_url || fetched.avatarUrl, files: fetched.files || [] };
              if (!withFiles.files?.length) {
                const files = await personaApi.getFiles(id);
                withFiles.files = files.map((f) => ({ ...f, createdAt: f.created_at || f.createdAt }));
              }
              restoredPersonas.push(withFiles);
            } catch (err) {
              console.error('Failed to fetch persona:', id, err);
            }
          }
        }
      }
      setSelectedPersonas(restoredPersonas);
    } else {
      // Single-persona session
      let persona: Persona | null = null;
      const cachedPersona = localStorage.getItem(`simulationPersona_${session.id}`);
      if (cachedPersona) {
        try {
          persona = JSON.parse(cachedPersona);
        } catch (err) {
          console.error('Failed to parse cached persona:', err);
        }
      }
      if (!persona) {
        persona = personas.find((p) => p.id === session.personaId) || null;
      }
      if (!persona && session.personaId) {
        try {
          const fetchedPersona = await personaApi.getById(session.personaId);
          persona = {
            ...fetchedPersona,
            avatarUrl: fetchedPersona.avatar_url || fetchedPersona.avatarUrl,
            createdAt: fetchedPersona.created_at || fetchedPersona.createdAt,
            updatedAt: fetchedPersona.updated_at || fetchedPersona.updatedAt,
            files: fetchedPersona.files || [],
          };
          if (!persona.files || persona.files.length === 0) {
            const files = await personaApi.getFiles(persona.id);
            persona.files = files.map((f) => ({ ...f, createdAt: f.created_at || f.createdAt }));
          }
          localStorage.setItem(`simulationPersona_${session.id}`, JSON.stringify(persona));
        } catch (err) {
          console.error('Failed to fetch persona:', err);
        }
      }
      if (persona && (!persona.files || persona.files.length === 0)) {
        try {
          const files = await personaApi.getFiles(persona.id);
          persona.files = files.map((f) => ({ ...f, createdAt: f.created_at || f.createdAt }));
          localStorage.setItem(`simulationPersona_${session.id}`, JSON.stringify(persona));
        } catch (err) {
          console.error('Failed to load persona files:', err);
        }
      }
      setSelectedPersonas(persona ? [persona] : []);
    }

    // Load messages from localStorage
    try {
      const savedMessages = localStorage.getItem(`simulationMessages_${session.id}`);
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages);
        setMessages(parsed);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load messages from localStorage:', err);
      setMessages([]);
    }

    try {
      const savedResults = localStorage.getItem(`simulationPersonaResults_${session.id}`);
      if (savedResults) {
        const parsed = JSON.parse(savedResults);
        setPersonaResults(Array.isArray(parsed) ? parsed : []);
      } else {
        setPersonaResults([]);
      }
    } catch (err) {
      console.error('Failed to load persona results from localStorage:', err);
      setPersonaResults([]);
    }
    
    setStage('result');
    setIsLoading(false);
  };

  const deleteSession = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm("Delete this simulation history?")) {
      try {
        await simulationApi.delete(id);
        try {
          localStorage.removeItem(`simulationPersonaResults_${id}`);
        } catch { /* ignore */ }
        loadHistory();
        if (currentSessionId === id) {
          setStage('selection');
          setCurrentSessionId(null);
        }
      } catch (err) {
        console.error('Failed to delete simulation:', err);
        alert('Failed to delete simulation. Please try again.');
      }
    }
  };

  const handleDeleteMessage = (messageId: string) => {
    setMessages(prev => {
      const updated = prev.filter(m => m.id !== messageId);
      // Update localStorage
      if (currentSessionId) {
        localStorage.setItem(`simulationMessages_${currentSessionId}`, JSON.stringify(updated));
      }
      return updated;
    });
  };

  const startNewSim = () => {
    setStage('selection');
    setCurrentSessionId(null);
    setSelectedSimulation(null);
    setSelectedFocusGroupId('');
    setMode(null);
    setSelectedPersonas([]);
    setPersonaResults([]);
    setBgInfo('');
    setOpeningLine('');
    setStimulusImage(null);
    setMimeType(null);
    setInputFields({});
    setSurveyGeneratedAnswers({});
    setMessages([]);
    setPersuasionContext(null);
  };

  return (
    <div className="flex min-h-[calc(100dvh-64px)] bg-white">
      {/* Sidebar - History */}
      <aside
        className="hidden md:flex shrink-0 flex-col border-r border-gray-100 bg-gray-50/50"
        style={{ width: leftPanelWidth }}
      >
        <div className="p-4 border-b border-gray-100 bg-white">
          <button
            onClick={startNewSim}
            className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
          >
            <Sparkles className="w-3.5 h-3.5" /> New Simulation
          </button>
        </div>
        <div className="flex-grow overflow-y-auto p-3 space-y-1.5">
           <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-3 px-2">Simulation Logs</h3>
           {simulationHistory.length > 0 ? simulationHistory.map(s => (
             <div key={s.id} className="group relative">
               <button
                 onClick={() => resumeSimulation(s)}
                 className={`w-full text-left p-3 rounded-xl text-sm font-bold transition-all flex items-center gap-3 ${currentSessionId === s.id ? 'bg-white text-indigo-600 shadow-lg border border-gray-100' : 'text-gray-500 hover:bg-white hover:text-gray-900'}`}
               >
                 <History className={`w-3.5 h-3.5 shrink-0 ${currentSessionId === s.id ? 'text-indigo-600' : 'opacity-30'}`} />
                 <span className="truncate pr-6">{s.name}</span>
               </button>
               <button 
                 onClick={(e) => deleteSession(e, s.id)}
                 className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
               >
                 <Trash2 className="w-4 h-4" />
               </button>
             </div>
           )) : (
             <div className="p-10 text-center">
               <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">No history yet</p>
             </div>
           )}
        </div>
      </aside>

      <div className="hidden md:flex shrink-0">
        <ResizableDivider onDrag={updateLeftWidth} />
      </div>

      {/* Main Area */}
      <main className="flex-grow flex flex-col relative bg-white overflow-hidden min-w-0">
        {stage === 'selection' && (
          <div className="max-w-6xl mx-auto px-6 py-12 w-full overflow-y-auto">
            <div className="text-center mb-16">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-indigo-50 text-indigo-600 text-xs font-black uppercase tracking-widest mb-4">
                 Validation Engine
              </div>
              <h1 className="text-5xl font-black text-gray-900 mb-4 tracking-tight">Execute Simulation</h1>
              <p className="text-xl text-gray-500 font-medium max-w-2xl mx-auto">Select a specialized testing mode to see how your synthetic personas react to your work.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {isLoadingSimulations ? (
                <div className="col-span-full text-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
                  <p className="text-gray-500">Loading simulations...</p>
                </div>
              ) : simulationsError ? (
                <div className="col-span-full text-center py-12">
                  <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-4" />
                  <p className="text-red-600 font-bold mb-2">Failed to load simulations</p>
                  <p className="text-gray-500 text-sm">{simulationsError}</p>
                  <button
                    onClick={() => {
                      const loadSimulations = async () => {
                        setIsLoadingSimulations(true);
                        setSimulationsError(null);
                        try {
                          const sims = await simulationTemplateApi.getAll();
                          setSimulations(sims);
                        } catch (error) {
                          console.error('Failed to load simulations:', error);
                          const errorMessage = error instanceof Error ? error.message : 'Failed to load simulations';
                          setSimulationsError(errorMessage);
                        } finally {
                          setIsLoadingSimulations(false);
                        }
                      };
                      loadSimulations();
                    }}
                    className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : simulations.length === 0 ? (
                <div className="col-span-full text-center py-12">
                  <p className="text-gray-500">No simulations available</p>
                </div>
              ) : (
                simulations.map((sim) => {
                  const Icon = getIcon(sim.icon);
                  return (
                    <button
                      key={sim.id}
                      onClick={() => { 
                        setSelectedSimulation(sim);
                        setStage('inputs');
                        setSelectedFocusGroupId('');
                        setSelectedPersonas([]);
                        // Reset input fields when selecting new simulation
                        setInputFields({});
                        setSurveyGeneratedAnswers({});
                      }}
                      className="group p-8 bg-white border border-gray-100 rounded-[2.5rem] text-left hover:shadow-2xl hover:-translate-y-2 transition-all border-b-8 hover:border-indigo-600 flex flex-col h-full"
                    >
                      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-8 shadow-lg transition-all group-hover:scale-110 group-hover:text-white bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600">
                        <Icon className="w-7 h-7" />
                      </div>
                      <h3 className="text-xl font-black text-gray-900 mb-2">{sim.title}</h3>
                      <p className="text-gray-400 text-sm font-medium leading-relaxed flex-grow">{truncateDescriptionToWords(sim.description || 'Stress-test your strategy using this specialized simulation prompt.')}</p>
                      <div className="mt-8 flex items-center text-[10px] font-black uppercase tracking-[0.2em] text-gray-300 group-hover:text-indigo-600">
                        Configure Test <ChevronRight className="ml-2 w-3 h-3" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}

        {stage === 'inputs' && (
          <div className="max-w-4xl mx-auto px-6 py-12 w-full overflow-y-auto">
            <button onClick={() => setStage('selection')} className="flex items-center text-sm font-black text-gray-400 uppercase tracking-widest mb-8 hover:text-indigo-600 transition-colors">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Modes
            </button>

            <div className="bg-white rounded-[3rem] shadow-2xl shadow-gray-200/50 border border-gray-100 p-8 sm:p-14 space-y-12">
              <div className="flex items-center gap-6 pb-8 border-b border-gray-50">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg bg-indigo-600 text-white`}>
                  {selectedSimulation && React.createElement(getIcon(selectedSimulation.icon), { className: "w-8 h-8" })}
                </div>
                <div>
                  <h2 className="text-3xl font-black text-gray-900">{selectedSimulation?.title || 'Simulation'}</h2>
                  <p className="text-gray-400 font-bold uppercase text-[10px] tracking-widest">Input Data & Stimulus</p>
                </div>
              </div>

              <div className="space-y-10">
                <div className="space-y-4">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">1. Select Target Persona{personaCountMax > 1 ? 's' : ''}</label>
                  {selectedSimulation?.allowed_persona_types?.length ? (
                    <p className="text-xs text-gray-500">Only personas of type: {(selectedSimulation.allowed_persona_types as string[]).map(t => t.replace(/_/g, ' ')).join(', ')}</p>
                  ) : null}
                  {personaCountMax > 1 && (
                    <p className="text-xs text-gray-500">Select between {personaCountMin} and {personaCountMax} persona{personaCountMax > 1 ? 's' : ''}. Each will receive the same inputs and provide their own response.</p>
                  )}
                  {allowedPersonasForSimulation.length === 0 ? (
                    <div className="p-6 bg-amber-50 border border-amber-100 rounded-2xl text-amber-700 text-sm font-bold flex gap-3">
                       <AlertCircle className="w-5 h-5" />
                       {personas.length === 0
                         ? "You haven't built any personas yet."
                         : selectedSimulation?.allowed_persona_types?.length
                           ? `No personas match this simulation's allowed types (${(selectedSimulation.allowed_persona_types as string[]).map(t => t.replace(/_/g, ' ')).join(', ')}). Create a persona of one of these types to run it.`
                           : "You haven't built any personas yet."}
                    </div>
                  ) : (
                    <>
                      {focusGroupsWithAllowedPersonas.length > 0 && (
                        <div className="flex items-center gap-3 flex-wrap mb-4 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                          <span className="text-sm font-semibold text-gray-700">Add focus group:</span>
                          <select
                            className="border border-gray-200 rounded-xl py-2 px-4 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                            value={selectedFocusGroupId}
                            onChange={(e) => {
                              const id = e.target.value;
                              setSelectedFocusGroupId(id);
                              if (!id) {
                                setSelectedPersonas([]);
                                return;
                              }
                              const group = focusGroups.find(g => g.id === id);
                              if (!group) return;
                              const toAdd = group.personaIds
                                .map(pid => allowedPersonasForSimulation.find(p => p.id === pid))
                                .filter((p): p is Persona => p != null);
                              setSelectedPersonas(toAdd);
                            }}
                          >
                            <option value="">Choose a group...</option>
                            {focusGroupsWithAllowedPersonas.map(g => (
                              <option key={g.id} value={g.id}>
                                {g.name} ({g.personaIds.length})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {allowedPersonasForSimulation.map(p => {
                        const isSelected = selectedPersonas.some(sp => sp.id === p.id);
                        const atMax = !usingFocusGroup && selectedPersonas.length >= personaCountMax;
                        const canToggle = isSelected || !atMax;
                        return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            if (!canToggle) return;
                            if (selectedFocusGroupId) setSelectedFocusGroupId('');
                            if (isSelected) {
                              setSelectedPersonas(prev => prev.filter(sp => sp.id !== p.id));
                            } else {
                              setSelectedPersonas(prev => [...prev, p]);
                            }
                          }}
                          className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${isSelected ? 'border-indigo-600 bg-indigo-50 shadow-lg' : 'border-gray-50 hover:border-indigo-100 bg-white'} ${!canToggle ? 'opacity-60 cursor-default' : 'cursor-pointer'}`}
                        >
                          <img src={p.avatarUrl} alt={getPersonaDisplayName(p)} className="w-10 h-10 rounded-xl object-cover" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-black text-gray-900 truncate">{getPersonaDisplayName(p)}</p>
                            {(p.description?.trim()) ? <p className="text-[10px] text-gray-500 truncate mt-0.5">{p.description.trim()}</p> : null}
                            {isSelected && <p className="text-[10px] text-indigo-600 font-bold">Selected</p>}
                          </div>
                        </button>
                      ); })}
                    </div>
                    </>
                  )}
                </div>

                <div className="p-4 rounded-2xl border border-indigo-100 bg-indigo-50/60 mb-6">
                  <label className="block text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-2">Interview sample launcher</label>
                  <div className="flex flex-wrap gap-2">
                    {interviewSamples.map((sample) => (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => loadInterviewSample(sample.id)}
                        className={`px-3 py-2 rounded-xl text-xs font-bold border transition ${
                          selectedInterviewSampleId === sample.id
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-indigo-700 border-indigo-200 hover:border-indigo-400'
                        }`}
                      >
                        {sample.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Generated survey: show questions list (after personas selected) then answer inputs; else render runner input fields */}
                {selectedSimulation?.simulation_type === 'survey' &&
                 (selectedSimulation.type_specific_config?.survey_mode === 'generated') &&
                 ((selectedSimulation.type_specific_config?.survey_questions as SurveyQuestion[])?.length ?? 0) > 0 ? (
                  <div className="space-y-8">
                    {selectedPersonas.length === 0 ? (
                      <p className="text-sm text-gray-500 font-medium py-4">
                        Select at least one persona above to see the survey questions and provide answers.
                      </p>
                    ) : (
                      <>
                        <div className="space-y-4">
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">2. Survey questions</label>
                          <p className="text-sm text-gray-500 mb-3">The selected persona(s) will answer these questions. No input needed from you.</p>
                          <ul className="list-none space-y-3 p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                            {(selectedSimulation.type_specific_config.survey_questions as SurveyQuestion[]).map((q, idx) => (
                              <li key={idx} className="flex gap-3 text-sm">
                                <span className="font-bold text-indigo-600 shrink-0">{idx + 1}.</span>
                                <span className="text-gray-800">{q.question}</span>
                                {q.type === 'multiple_choice' && (q.options?.length ?? 0) > 0 && (
                                  <span className="text-gray-500 text-xs shrink-0">({(q.options || []).filter(Boolean).join(', ')})</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                        <button
                          disabled={isLoading || selectedPersonas.length < personaCountMin || (!usingFocusGroup && selectedPersonas.length > personaCountMax) || !selectedSimulation || requiredBusinessProfileMissing}
                          onClick={startSimulation}
                          className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-lg shadow-2xl shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-30 transition-all flex items-center justify-center gap-4 group"
                        >
                          <>Start Simulation <ChevronRight className="w-6 h-6 group-hover:translate-x-1" /></>
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                <>
                {(selectedSimulation?.simulation_type === 'survey' &&
                  selectedSimulation.type_specific_config?.survey_mode === 'generated'
                  ? (selectedSimulation.required_input_fields ?? []).filter((f) => f.type !== 'survey_questions')
                  : selectedSimulation?.required_input_fields ?? []
                ).map((field, index) => {
                  const fieldNumber = index + 2;
                  const isBusinessProfileField = field.type === 'business_profile' || field.name === 'businessProfile';
                  if (isBusinessProfileField) {
                    return (
                      <div key={field.name} className="space-y-4">
                        <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          {fieldNumber}. Business background {field.required && '*'}
                        </span>
                        <div className="p-6 bg-gray-50 border border-gray-100 rounded-3xl">
                          {businessProfileLoading ? (
                            <div className="flex items-center gap-2 text-gray-500 font-medium">
                              <Loader2 className="w-5 h-5 animate-spin" /> Loading business background...
                            </div>
                          ) : savedBusinessProfile ? (
                            <div>
                              <p className="text-sm font-bold text-indigo-700 mb-1">Using your saved business background</p>
                              <p className="text-sm text-gray-600">{savedBusinessProfile.business_name || 'Unnamed'} — {savedBusinessProfile.industry_served || 'No industry'}. Details from Settings are included as context.</p>
                            </div>
                          ) : (
                            <p className="text-amber-800 font-medium">No business background saved. Add it in Settings → Business background to use here.</p>
                          )}
                        </div>
                      </div>
                    );
                  }
                  if (field.type === 'image') {
                    return (
                      <div key={field.name} className="space-y-4">
                        <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          {fieldNumber}. {field.name} {field.required && '*'}
                        </span>
                        <div className="relative group cursor-pointer border-4 border-dashed border-gray-100 rounded-[2.5rem] p-12 text-center hover:border-indigo-300 transition-all bg-gray-50/50 overflow-hidden">
                          {inputFields[field.name] || stimulusImage ? (
                            <div className="relative inline-block">
                              <img src={inputFields[field.name] || stimulusImage || ''} className="max-h-64 mx-auto rounded-xl shadow-2xl border border-white" />
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setInputFields({ ...inputFields, [field.name]: '' });
                                  setStimulusImage(null);
                                }} 
                                className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-lg"
                              >
                                <CloseIcon className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto text-gray-400 group-hover:text-indigo-600 transition-colors">
                                <Upload className="w-8 h-8" />
                              </div>
                              <p className="text-gray-500 font-bold">Upload file</p>
                            </div>
                          )}
                          <input 
                            type="file" 
                            accept="*/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setMimeType(file.type);
                                const reader = new FileReader();
                                reader.onload = (ev) => {
                                  const result = ev.target?.result as string;
                                  setInputFields({ ...inputFields, [field.name]: result });
                                  setStimulusImage(result);
                                };
                                reader.readAsDataURL(file);
                              }
                            }} 
                            className="absolute inset-0 opacity-0 cursor-pointer" 
                          />
                        </div>
                      </div>
                    );
                  }
                  if (field.type === 'table') {
                    return (
                      <div key={field.name} className="space-y-4">
                        <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          {fieldNumber}. {field.name} {field.required && '*'}
                        </span>
                        <div className="relative group cursor-pointer border-4 border-dashed border-gray-100 rounded-[2.5rem] p-12 text-center hover:border-indigo-300 transition-all bg-gray-50/50">
                          {inputFields[field.name] ? (
                            <div className="relative">
                              <p className="text-sm text-gray-700 font-medium">File uploaded (table data)</p>
                              <button
                                type="button"
                                onClick={() => setInputFields({ ...inputFields, [field.name]: '' })}
                                className="mt-2 text-red-600 hover:text-red-800 text-sm font-bold"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto text-gray-400 group-hover:text-indigo-600 transition-colors">
                                <Upload className="w-8 h-8" />
                              </div>
                              <p className="text-gray-500 font-bold">Upload file</p>
                            </div>
                          )}
                          <input
                            type="file"
                            accept="*/*"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                const result = ev.target?.result as string;
                                setInputFields({ ...inputFields, [field.name]: result });
                              };
                              if (file.name.toLowerCase().endsWith('.csv')) {
                                reader.readAsText(file);
                              } else {
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </div>
                      </div>
                    );
                  }
                  if (field.type === 'pdf') {
                    return (
                      <div key={field.name} className="space-y-4">
                        <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          {fieldNumber}. {field.name} {field.required && '*'}
                        </span>
                        <div className="relative group cursor-pointer border-4 border-dashed border-gray-100 rounded-[2.5rem] p-12 text-center hover:border-indigo-300 transition-all bg-gray-50/50">
                          {inputFields[field.name] ? (
                            <div className="relative">
                              <p className="text-sm text-gray-700 font-medium">File uploaded</p>
                              <button
                                type="button"
                                onClick={() => setInputFields({ ...inputFields, [field.name]: '' })}
                                className="mt-2 text-red-600 hover:text-red-800 text-sm font-bold"
                              >
                                Remove
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mx-auto text-gray-400 group-hover:text-indigo-600 transition-colors">
                                <Upload className="w-8 h-8" />
                              </div>
                              <p className="text-gray-500 font-bold">Upload file</p>
                            </div>
                          )}
                          <input
                            type="file"
                            accept="*/*"
                            className="absolute inset-0 opacity-0 cursor-pointer"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const reader = new FileReader();
                              reader.onload = (ev) => {
                                setInputFields({ ...inputFields, [field.name]: ev.target?.result as string });
                              };
                              reader.readAsDataURL(file);
                            }}
                          />
                        </div>
                      </div>
                    );
                  }
                  if (field.type === 'survey_questions') {
                    const qs = runnerSurveyQuestions[field.name] || [];
                    const updateQ = (idx: number, patch: Partial<SurveyQuestion>) => {
                      setRunnerSurveyQuestions((prev) => {
                        const next = [...(prev[field.name] || [])];
                        next[idx] = { ...next[idx], ...patch };
                        return { ...prev, [field.name]: next };
                      });
                    };
                    const removeQ = (idx: number) => {
                      setRunnerSurveyQuestions((prev) => ({
                        ...prev,
                        [field.name]: (prev[field.name] || []).filter((_, i) => i !== idx),
                      }));
                    };
                    const addQ = () => {
                      setRunnerSurveyQuestions((prev) => ({
                        ...prev,
                        [field.name]: [...(prev[field.name] || []), { type: 'text', question: '' }],
                      }));
                    };
                    return (
                      <div key={field.name} className="space-y-4">
                        <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          {fieldNumber}. {field.name} {field.required && '*'}
                        </span>
                        <div className="space-y-3">
                          {qs.map((q, idx) => (
                            <div key={idx} className="p-4 border border-gray-200 rounded-2xl bg-gray-50 space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-medium text-gray-700">Question {idx + 1}</span>
                                <button type="button" onClick={() => removeQ(idx)} className="text-red-600 hover:text-red-800 text-sm">
                                  Remove
                                </button>
                              </div>
                              <select
                                value={q.type}
                                onChange={(e) => updateQ(idx, { type: e.target.value as SurveyQuestion['type'] })}
                                className="w-full max-w-[180px] px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                              >
                                <option value="text">Text</option>
                                <option value="numeric">Numeric</option>
                                <option value="multiple_choice">Multiple choice</option>
                              </select>
                              <input
                                type="text"
                                value={q.question}
                                onChange={(e) => updateQ(idx, { question: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
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
                                          updateQ(idx, { options: opts });
                                        }}
                                        className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => updateQ(idx, { options: (q.options || []).filter((_, i) => i !== oi) })}
                                        className="text-red-600 text-sm"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => updateQ(idx, { options: [...(q.options || []), ''] })}
                                    className="text-sm text-indigo-600 flex items-center gap-1"
                                  >
                                    <Plus className="w-4 h-4" /> Add option
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                          {qs.length < 1 && (
                            <button
                              type="button"
                              onClick={addQ}
                              className="w-full py-3 border-2 border-dashed border-gray-200 rounded-2xl text-gray-500 hover:border-indigo-300 hover:text-indigo-600 flex items-center justify-center gap-2 text-sm transition-colors"
                            >
                              <Plus className="w-4 h-4" /> Add question
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }
                  if (field.type === 'multiple_choice') {
                    const options = (field.options || []).filter(Boolean);
                    const value = inputFields[field.name] ?? '';
                    return (
                      <div key={field.name} className="space-y-4">
                        <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
                          {fieldNumber}. {field.name} {field.required && '*'}
                        </span>
                        <select
                          value={value}
                          onChange={(e) => setInputFields({ ...inputFields, [field.name]: e.target.value })}
                          required={field.required}
                          className="w-full p-6 bg-gray-50 border border-gray-100 rounded-3xl font-medium focus:ring-4 focus:ring-indigo-100 outline-none transition-all"
                        >
                          <option value="">Select...</option>
                          {options.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    );
                  }
                  const value = inputFields[field.name] || (field.name === 'bgInfo' ? bgInfo : '');
                  return (
                    <div key={field.name} className="space-y-4">
                      <span className="block text-[10px] font-black text-gray-400 uppercase tracking-widest">
                        {fieldNumber}. {field.name} {field.required && '*'}
                      </span>
                      <textarea
                        value={value}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          setInputFields({ ...inputFields, [field.name]: newValue });
                          if (field.name === 'bgInfo') setBgInfo(newValue);
                        }}
                        required={field.required}
                        rows={4}
                        className="w-full p-6 bg-gray-50 border border-gray-100 rounded-3xl font-medium focus:ring-4 focus:ring-indigo-100 outline-none transition-all resize-y min-h-[120px]"
                      />
                    </div>
                  );
                })}

                <button
                  disabled={isLoading || selectedPersonas.length < personaCountMin || (!usingFocusGroup && selectedPersonas.length > personaCountMax) || !selectedSimulation || requiredBusinessProfileMissing}
                  onClick={startSimulation}
                  className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-lg shadow-2xl shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-30 transition-all flex items-center justify-center gap-4 group"
                >
                  <>Start Simulation <ChevronRight className="w-6 h-6 group-hover:translate-x-1" /></>
                </button>
              </>
                )}
              </div>
            </div>
          </div>
        )}

        {stage === 'result' && (() => {
          // Output presentation and parsing are based solely on the current simulation type,
          // not on all simulation types; only simulationOutputType drives how we render.
          const simulationOutputType = (selectedSimulation?.simulation_type || 'report') as string;
          const isReport = simulationOutputType === 'report';
          const isSurvey = simulationOutputType === 'survey';
          const isResponseSim = simulationOutputType === 'response_simulation';
          const isIdeaGeneration = simulationOutputType === 'idea_generation';
          const isChatLike = simulationOutputType === 'persuasion_simulation' || simulationOutputType === 'persona_conversation';
          const isPersonaConversation = simulationOutputType === 'persona_conversation';
          /** Batch (non-chat) simulations: pipeline + activity at top. Chat UIs use per-message pipeline. */
          const showTopAgentStrip = isLoading && !isChatLike;
          const showPersonaConversationActivity = isLoading && isPersonaConversation;
          const showPersuasionRunPipeline = isChatLike && !isPersonaConversation && isLoading;
          const personaById = new Map<string, Persona>(selectedPersonas.map((p) => [p.id, p]));
          const firstPersonaMessage = messages.find(m => m.senderType === 'persona');
          const firstPersonaContent = firstPersonaMessage?.content || '';
          const firstPersonaPipelineEvents =
            firstPersonaMessage != null
              ? pipelineEventsFromStoredMessage(firstPersonaMessage)
              : personaResults[0] != null
                ? pipelineEventsFromPersonaResult(personaResults[0])
                : [];
          const handleDownloadReport = () => {
            const text = messages.map(m => `${m.senderType === 'user' ? runnerDisplayName : (selectedPersona?.name || stablePersonaFallback)}: ${m.content}`).join('\n\n');
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `report-${selectedSimulation?.title || 'simulation'}-${new Date().toISOString().slice(0,10)}.txt`;
            a.click();
            URL.revokeObjectURL(url);
          };

          const handleDownloadSurveyCsv = () => {
            const surveyDataKey = currentSessionId ? `simulationSurveyData_${currentSessionId}` : null;
            const stored = surveyDataKey ? localStorage.getItem(surveyDataKey) : null;
            const parsed = stored ? (() => { try { return JSON.parse(stored); } catch { return null; } })() : null;
            const isGenerated = parsed?.questions?.length && Array.isArray(parsed.questions);

            if (isGenerated && parsed.questions && parsed.answers !== undefined) {
              const header = ['Participant', 'Question', 'Answer'];
              const rows = parsed.questions.map((q: SurveyQuestion, i: number) => [
                parsed.respondentName ?? 'Participant',
                q.question,
                (parsed.answers as Record<number, string>)[i] ?? '',
              ]);
              const csv = [header.map(h => `"${String(h).replace(/"/g, '""')}"`).join(','), ...rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
              const blob = new Blob([csv], { type: 'text/csv' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = `survey-${selectedSimulation?.title || 'survey'}-${new Date().toISOString().slice(0,10)}.csv`;
              a.click();
              URL.revokeObjectURL(url);
              return;
            }
            const rows = messages.map(m => [
              m.senderType === 'user' ? runnerDisplayName : (selectedPersona?.name || stablePersonaFallback),
              m.content.replace(/"/g, '""'),
            ]);
            const csv = ['"Participant","Response"', ...rows.map(r => `"${r[0]}","${r[1]}"`)].join('\n');
            const blob = new Blob([csv], { type: 'text/csv' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `survey-${selectedSimulation?.title || 'survey'}-${new Date().toISOString().slice(0,10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
          };

          return (
          <div className="flex flex-col h-full bg-white relative">
            <header className="px-10 py-7 border-b border-gray-100 flex items-center justify-between bg-white/80 backdrop-blur-xl z-10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h2 className="text-2xl font-black text-gray-900">
                  {isReport ? 'Report' : isSurvey ? 'Survey Results' : isResponseSim ? 'Response' : isIdeaGeneration ? 'Ideas' : simulationOutputType === 'persuasion_simulation' ? 'Persuasion Workspace' : simulationOutputType === 'persona_conversation' ? 'Persona v Persona' : 'Simulation Workspace'}
                </h2>
              </div>
              <div className="flex items-center gap-4">
                {isChatLike && !isPersonaConversation && <div className="px-3 py-1 bg-green-50 text-green-600 rounded-lg text-[10px] font-black uppercase tracking-widest">Live Roleplay</div>}
                {isPersonaConversation && <div className="px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-black uppercase tracking-widest">Moderated Discussion</div>}
                {(isReport || isSurvey) && (
                  <button onClick={isReport ? handleDownloadReport : handleDownloadSurveyCsv} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-bold">
                    <Download className="w-4 h-4" /> {isReport ? 'Download Report' : 'Download CSV'}
                  </button>
                )}
                <button onClick={startNewSim} className="p-2 text-gray-400 hover:text-indigo-600 transition-colors"><Plus className="w-5 h-5" /></button>
              </div>
            </header>

            {/* Batch simulations only: pipeline + activity log at top */}
            {showTopAgentStrip && (
              <div className="mx-10 mt-6 shrink-0 space-y-4 pb-6 border-b border-gray-100">
                <AgentPipelineViewer events={pipelineEvents} isActive={pipelineActive} />
                <div className="p-5 bg-indigo-50/80 border border-indigo-100 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <h3 className="text-xs font-black text-indigo-700 uppercase tracking-widest flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Simulation in progress — API calls
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        simulationCancelledRef.current = true;
                        setIsLoading(false);
                        setPipelineActive(false);
                      }}
                      className="shrink-0 flex items-center gap-2 px-4 py-2 border-2 border-red-200 text-red-600 rounded-xl font-bold hover:bg-red-50 transition-all text-sm"
                    >
                      <CloseIcon className="w-4 h-4" />
                      Cancel
                    </button>
                  </div>
                  {simulationActivityLog.length > 0 ? (
                    <ul className="space-y-1.5 max-h-36 overflow-y-auto">
                      {simulationActivityLog.map((a) => (
                        <li
                          key={a.id}
                          className={`flex items-center gap-3 text-sm font-medium ${
                            a.status === 'done'
                              ? 'text-green-700'
                              : a.status === 'error'
                                ? 'text-red-600'
                                : a.status === 'active'
                                  ? 'text-indigo-700'
                                  : 'text-gray-500'
                          }`}
                        >
                          {a.status === 'done' && (
                            <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">✓</span>
                          )}
                          {a.status === 'error' && (
                            <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs">✕</span>
                          )}
                          {a.status === 'active' && (
                            <Loader2 className="w-5 h-5 animate-spin text-indigo-600 shrink-0" />
                          )}
                          <span>{a.label}</span>
                          {a.detail && <span className="text-gray-500 text-xs">({a.detail})</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-indigo-600/80 font-medium">Starting simulation…</p>
                  )}
                </div>
              </div>
            )}

            {/* Persona v Persona: activity log only at top (per-turn pipeline lives on each message) */}
            {showPersonaConversationActivity && (
              <div className="mx-10 mt-6 shrink-0 pb-6 border-b border-gray-100">
                <div className="p-5 bg-indigo-50/80 border border-indigo-100 rounded-2xl shadow-sm">
                  <div className="flex items-center justify-between gap-4 mb-3">
                    <h3 className="text-xs font-black text-indigo-700 uppercase tracking-widest flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Discussion in progress — API calls
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        simulationCancelledRef.current = true;
                        setIsLoading(false);
                        setPipelineActive(false);
                      }}
                      className="shrink-0 flex items-center gap-2 px-4 py-2 border-2 border-red-200 text-red-600 rounded-xl font-bold hover:bg-red-50 transition-all text-sm"
                    >
                      <CloseIcon className="w-4 h-4" />
                      Cancel
                    </button>
                  </div>
                  {simulationActivityLog.length > 0 ? (
                    <ul className="space-y-1.5 max-h-36 overflow-y-auto">
                      {simulationActivityLog.map((a) => (
                        <li
                          key={a.id}
                          className={`flex items-center gap-3 text-sm font-medium ${
                            a.status === 'done'
                              ? 'text-green-700'
                              : a.status === 'error'
                                ? 'text-red-600'
                                : a.status === 'active'
                                  ? 'text-indigo-700'
                                  : 'text-gray-500'
                          }`}
                        >
                          {a.status === 'done' && (
                            <span className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center text-white text-xs">✓</span>
                          )}
                          {a.status === 'error' && (
                            <span className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs">✕</span>
                          )}
                          {a.status === 'active' && (
                            <Loader2 className="w-5 h-5 animate-spin text-indigo-600 shrink-0" />
                          )}
                          <span>{a.label}</span>
                          {a.detail && <span className="text-gray-500 text-xs">({a.detail})</span>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-indigo-600/80 font-medium">Starting discussion…</p>
                  )}
                </div>
              </div>
            )}

            {/* Activity log summary (when persona_conversation completed) */}
            {!isLoading && isPersonaConversation && simulationActivityLog.length > 0 && (
              <div className="mx-10 mb-4 p-4 bg-green-50 border border-green-100 rounded-xl">
                <p className="text-xs font-black text-green-700 uppercase tracking-widest">
                  Completed in {simulationActivityLog.filter((a) => a.status === 'done').length} API calls
                </p>
              </div>
            )}

            {/* Main content: chat UI for chat/persuasion, single-output for others */}
            {isChatLike ? (
            <div className="flex-grow min-h-0 overflow-y-auto p-10 space-y-10 bg-gray-50/20">
              {showPersuasionRunPipeline && selectedPersona && (
                <div className="space-y-3 max-w-[85%] sm:max-w-[70%]">
                  <p className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">
                    {getPersonaDisplayName(selectedPersona)}
                  </p>
                  <AgentPipelineViewer events={pipelineEvents} isActive={pipelineActive} compact />
                  <div className="flex items-center gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/50 px-5 py-3 text-sm font-semibold text-indigo-800">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
                    Generating first response…
                  </div>
                </div>
              )}
              {messages.map((m) => {
                const isUser = m.senderType === 'user';
                const isModerator = m.senderType === 'moderator';
                const isAgentPersona = !isUser && !isModerator;
                const messagePersona = m.personaId ? personaById.get(m.personaId) : null;
                const displayName = isModerator ? 'Moderator' : isUser ? runnerDisplayName : getPersonaDisplayName(messagePersona);
                const avatarUrl = messagePersona?.avatarUrl ?? messagePersona?.avatar_url;
                const msgPipeline = isAgentPersona ? pipelineEventsFromStoredMessage(m) : [];
                return (
                  <div key={m.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 group`}>
                    <div className={`flex gap-5 max-w-[85%] sm:max-w-[70%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className="shrink-0 mt-1">
                        {isUser ? (
                          <div className="w-12 h-12 bg-gray-900 rounded-xl flex items-center justify-center shadow-lg"><User className="text-white w-7 h-7" /></div>
                        ) : isModerator ? (
                          <div className="w-12 h-12 bg-amber-500 rounded-xl flex items-center justify-center shadow-lg text-white font-black text-base">M</div>
                        ) : (
                          <img src={avatarUrl} alt={displayName} className="w-12 h-12 rounded-xl shadow-lg border-2 border-white ring-4 ring-gray-100 object-cover" />
                        )}
                      </div>
                      <div className="space-y-2 min-w-0 flex-1 relative">
                        {!isUser && <p className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">{displayName}</p>}
                        {isAgentPersona && (
                          <AgentPipelineViewer events={msgPipeline} isActive={false} compact />
                        )}
                        <div className={`p-6 rounded-3xl shadow-sm text-xl relative ${isUser ? 'bg-indigo-600 text-white rounded-tr-none' : isModerator ? 'bg-amber-50 border border-amber-200 text-gray-800 rounded-tl-none' : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'}`}>
                          <FormattedSimulationResponse content={m.content} isUser={isUser} />
                          {isAgentPersona && (
                            <button
                              onClick={() => copyTalkTrack(m.content)}
                              className="absolute top-2 right-10 px-2 py-1 text-[10px] font-bold rounded-md border border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                              title="Copy recommended talk track"
                            >
                              Copy Talk Track
                            </button>
                          )}
                          {!isPersonaConversation && (
                          <button
                            onClick={() => handleDeleteMessage(m.id)}
                            className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-lg"
                            title="Delete message"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                          )}
                        </div>
                        {messagePersona && !isUser && !isModerator && (messagePersona.description?.trim()) && (
                          <p className="text-xs text-gray-500 ml-1 mt-1 line-clamp-2">{messagePersona.description}</p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {isTyping && !isPersonaConversation && selectedPersona && (
                <div className="flex justify-start animate-in fade-in slide-in-from-bottom-4">
                  <div className="flex gap-5 max-w-[85%] sm:max-w-[70%]">
                    <div className="shrink-0 mt-1">
                      <img
                        src={selectedPersona.avatarUrl ?? selectedPersona.avatar_url ?? 'https://picsum.photos/seed/persona/200'}
                        alt={getPersonaDisplayName(selectedPersona)}
                        className="w-12 h-12 rounded-xl shadow-lg border-2 border-white ring-4 ring-gray-100 object-cover"
                      />
                    </div>
                    <div className="space-y-2 min-w-0 flex-1">
                      <p className="text-xs font-black text-gray-400 uppercase tracking-widest ml-1">
                        {getPersonaDisplayName(selectedPersona)}
                      </p>
                      <AgentPipelineViewer events={pipelineEvents} isActive={pipelineActive} compact />
                      <div className="flex gap-4 items-center bg-white border border-gray-100 px-6 py-4 rounded-[2rem] rounded-tl-none shadow-sm">
                        <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                        <span className="text-xs font-black text-gray-300 uppercase tracking-widest">Processing...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={scrollRef} />
            </div>
            ) : (
            <div className="flex-grow min-h-0 overflow-y-auto p-10 bg-gray-50/20">
              {isLoading && personaResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-4 animate-in fade-in duration-500">
                  <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                  <p className="text-lg font-bold text-gray-700">Generating results...</p>
                  <p className="text-sm text-gray-400 font-medium">The pipeline above shows real-time progress. Results will appear here shortly.</p>
                </div>
              ) : personaResults.length > 1 ? (
                <div className="space-y-8">
                  <p className="text-base text-gray-600 font-medium">Each persona’s response</p>
                  {personaResults.map((pr) => (
                    <div key={pr.personaId} className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm space-y-4">
                      <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                        {pr.avatarUrl && <img src={pr.avatarUrl} alt={pr.name} className="w-14 h-14 rounded-xl object-cover" />}
                        <div>
                          <span className="text-lg font-black text-gray-900 block">{pr.name}</span>
                          {(pr.description?.trim()) && <span className="text-sm text-gray-500">{pr.description.trim()}</span>}
                        </div>
                      </div>
                      <AgentPipelineViewer events={pipelineEventsFromPersonaResult(pr)} isActive={false} compact />
                      <div className="text-gray-800 text-lg leading-relaxed">
                        <FormattedSimulationResponse content={pr.content} isUser={false} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
              {firstPersonaPipelineEvents.length > 0 && (
                <div className="mb-6">
                  <AgentPipelineViewer events={firstPersonaPipelineEvents} isActive={false} compact />
                </div>
              )}
              {isReport && (
                <>
                  <p className="text-base text-gray-600 mb-4 font-medium">Summary</p>
                  <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm text-gray-800 text-lg leading-relaxed whitespace-pre-wrap">
                    <FormattedSimulationResponse content={firstPersonaContent} isUser={false} />
                  </div>
                </>
              )}
              {isSurvey && (
                <>
                  <p className="text-base text-gray-600 mb-2 font-medium">Summary & key points</p>
                  <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm text-gray-800 text-lg leading-relaxed">
                    <FormattedSimulationResponse content={firstPersonaContent} isUser={false} />
                  </div>
                </>
              )}
              {isResponseSim && (() => {
                const typeConfig = selectedSimulation?.type_specific_config || {};
                const decisionType = (typeConfig.decision_type as string) || 'numeric';
                const unit = (typeConfig.unit as string)?.trim();
                // Extract first numeric value (with optional decimals/thousands) for prominent display
                const numMatch = firstPersonaContent.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?|\d+(?:\.\d+)?)/);
                const displayNumber = numMatch ? numMatch[1].replace(/,/g, '') : null;
                return (
                <div className="space-y-6">
                  {decisionType === 'numeric' && (displayNumber != null || unit) && (
                    <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-6 text-center">
                      <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">Result</p>
                      <p className="text-3xl font-black text-indigo-900">
                        {displayNumber != null ? <>{displayNumber} </> : null}<span className="text-indigo-600">{unit || '—'}</span>
                      </p>
                    </div>
                  )}
                  <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm text-gray-800">
                    <FormattedSimulationResponse content={firstPersonaContent} isUser={false} />
                  </div>
                </div>
                );
              })()}
              {isIdeaGeneration && (
                <>
                  <p className="text-base text-gray-600 mb-4 font-medium">Ideas (bullet list)</p>
                  <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm text-gray-800 text-lg leading-relaxed list-disc">
                    <FormattedSimulationResponse content={firstPersonaContent} isUser={false} />
                  </div>
                </>
              )}
              {!isReport && !isSurvey && !isResponseSim && !isIdeaGeneration && (
                <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm text-gray-800">
                  <FormattedSimulationResponse content={firstPersonaContent} isUser={false} />
                  <div className="mt-4">
                    <button
                      onClick={() => copyTalkTrack(firstPersonaContent)}
                      className="px-3 py-1.5 text-xs font-bold rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                    >
                      Copy Talk Track
                    </button>
                  </div>
                </div>
              )}
              {isTyping && (
                <div className="mt-4 flex gap-4 items-center bg-white border border-gray-100 px-6 py-4 rounded-2xl shadow-sm">
                  <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                  <span className="text-xs font-black text-gray-300 uppercase tracking-widest">Processing...</span>
                </div>
              )}
              <div ref={scrollRef} />
            </>
              )}
            </div>
            )}

            {/* Follow-up input - only for persuasion_simulation (not persona_conversation) */}
            {isChatLike && !isPersonaConversation && (
            <div className="p-10 border-t border-gray-100 bg-white">
              <form onSubmit={handleSendFollowUp} className="max-w-4xl mx-auto">
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={(e) => { 
                      if(e.key === 'Enter' && !e.shiftKey) { 
                        e.preventDefault(); 
                        if (!isTyping && chatInput.trim() && selectedPersona && currentSessionId) {
                          handleSendFollowUp(); 
                        }
                      } 
                    }}
                    placeholder={isTyping ? "Please wait for response..." : "Ask a question or challenge this reaction..."}
                    disabled={isTyping || !selectedPersona || !currentSessionId}
                    className="w-full px-8 py-5 bg-gray-50 border border-gray-100 rounded-[2.5rem] font-medium focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:bg-white transition-all pr-20 shadow-inner resize-none min-h-[72px] overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                    rows={1}
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || isTyping || !selectedPersona || !currentSessionId}
                    className="absolute right-4 bottom-4 p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
            </div>
            )}
          </div>
          );
        })()}
      </main>

      {/* Resizable divider before right panel (only when right panel is shown) */}
      {stage === 'result' && selectedSimulation && (
        <div className="hidden lg:flex shrink-0">
          <ResizableDivider onDrag={updateRightWidth} />
        </div>
      )}

      {/* Info Context Bar (Only shown in Result Stage) */}
      {stage === 'result' && selectedSimulation && (() => {
        const simulationOutputType = (selectedSimulation?.simulation_type || 'report') as string;
        const isPersuasion = simulationOutputType === 'persuasion_simulation';
        const lastPersonaContent = [...messages].reverse().find(m => m.senderType === 'persona')?.content || '';
        const parsedLocal = parseLastPersuasionPercentFromText(lastPersonaContent);
        const persuasionScore =
          coerceSinglePersuasionScore(persuasionContext?.persuasionScore) ?? parsedLocal;
        return (
        <aside
          className="hidden lg:flex shrink-0 flex-col border-l border-gray-100 bg-gray-50/50 overflow-y-auto p-10 space-y-10"
          style={{ width: rightPanelWidth }}
        >
          {isPersuasion && (
            <div className="p-6 bg-white border border-gray-100 rounded-2xl shadow-sm">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">Persuasion (from API)</h4>
              {persuasionContextLoading ? (
                <div className="flex items-center gap-2 text-gray-500">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-base">Loading...</span>
                </div>
              ) : (
                <>
                  <p className="text-5xl font-black text-indigo-600 tracking-tight tabular-nums">
                    {persuasionScore != null ? (
                      <span>{persuasionScore}</span>
                    ) : (
                      <span className="text-gray-400 font-medium text-2xl">No score</span>
                    )}
                  </p>
                  <div className="mt-3 w-full h-4 bg-gray-200 rounded-full overflow-hidden border border-gray-300 shadow-inner">
                    <div
                      className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                      style={{ width: persuasionScore != null ? `${persuasionScore}%` : '0%' }}
                    />
                  </div>
                  <p className="text-sm text-gray-500 mt-2 font-medium">
                    {persuasionScore != null ? `${persuasionScore} out of 100` : 'out of 100'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">How persuaded the agent is</p>
                </>
              )}
            </div>
          )}
          <div className="flex items-center gap-4 pb-8 border-b border-gray-100">
             <img src={selectedPersona?.avatarUrl} className="w-20 h-20 rounded-2xl object-cover shadow-xl border-2 border-white" />
             <div>
               <h3 className="text-xl font-black text-gray-900 leading-tight mb-1">{selectedPersona?.name}</h3>
               <p className="text-xs text-indigo-600 font-black uppercase tracking-widest">{selectedSimulation?.title || 'Simulation'}</p>
             </div>
          </div>
          {stimulusImage && (
            <div className="space-y-3">
              <h4 className="text-xs font-black text-gray-400 uppercase tracking-widest">Stimulus Asset</h4>
              <img src={stimulusImage} className="w-full rounded-2xl shadow-sm border border-gray-100" />
            </div>
          )}
        </aside>
        );
      })()}
    </div>
  );
};

export default SimulationPage;
