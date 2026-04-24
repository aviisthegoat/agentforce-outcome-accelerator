import React, { useState, useEffect } from 'react';
import { Brain, Search, Sparkles, ShieldCheck, ChevronDown, ChevronRight, Check, Loader2, AlertTriangle } from 'lucide-react';
import type { AgentPipelineEvent, ValidationInfo } from '../services/agentApi.js';

interface Props {
  events: AgentPipelineEvent[];
  isActive: boolean;
  compact?: boolean;
}

type StepName = 'thinking' | 'retrieval' | 'responding' | 'validation';

interface StepState {
  status: 'pending' | 'active' | 'done';
  thinking?: string;
  searchQueries?: string[];
  chunks?: { source_type: string; source_name: string; score: number; preview: string }[];
  ragEmpty?: boolean;
  response?: string;
  validation?: ValidationInfo;
}

const STEP_META: { key: StepName; label: string; icon: React.ElementType }[] = [
  { key: 'thinking', label: 'Thinking', icon: Brain },
  { key: 'retrieval', label: 'Knowledge (full documents)', icon: Search },
  { key: 'responding', label: 'Generating Response', icon: Sparkles },
  { key: 'validation', label: 'Quality validation', icon: ShieldCheck },
];

function buildSteps(events: AgentPipelineEvent[]): Record<StepName, StepState> {
  const steps: Record<StepName, StepState> = {
    thinking: { status: 'pending' },
    retrieval: { status: 'pending' },
    responding: { status: 'pending' },
    validation: { status: 'pending' },
  };
  for (const ev of events) {
    if (ev.step === 'complete') continue;
    const s = steps[ev.step as StepName];
    if (!s) continue;
    if (ev.status === 'active') s.status = 'active';
    if (ev.status === 'done') {
      s.status = 'done';
      if (ev.step === 'thinking') { s.thinking = ev.thinking; s.searchQueries = ev.searchQueries; }
      if (ev.step === 'retrieval') { s.chunks = ev.chunks; s.ragEmpty = ev.ragEmpty; }
      if (ev.step === 'responding') { s.response = ev.response; }
      if (ev.step === 'validation') { s.validation = ev.validation; }
    }
  }
  return steps;
}

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 75 ? 'bg-green-100 text-green-800' : score >= 50 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800';
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${color}`}>{score}%</span>;
}

function StepRow({ meta, state, compact }: { key?: string; meta: typeof STEP_META[number]; state: StepState; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = meta.icon;
  const hasDoneContent = state.status === 'done';

  useEffect(() => {
    if (state.status === 'done' && meta.key === 'validation' && state.validation) {
      const c = state.validation.completeness_score ?? 50;
      if (state.validation.alignment_score < 50 || c < 50) setExpanded(true);
    }
  }, [state.status, state.validation, meta.key]);

  return (
    <div className={`${compact ? 'py-1.5' : 'py-2'}`}>
      <button
        onClick={() => hasDoneContent && setExpanded(!expanded)}
        className={`flex items-center gap-2 w-full text-left ${hasDoneContent ? 'cursor-pointer' : 'cursor-default'}`}
        disabled={!hasDoneContent}
      >
        <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
          {state.status === 'pending' && <div className="w-3 h-3 rounded-full border-2 border-gray-300" />}
          {state.status === 'active' && <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />}
          {state.status === 'done' && <Check className="w-4 h-4 text-green-500" />}
        </div>
        <Icon className={`w-4 h-4 ${state.status === 'active' ? 'text-indigo-500' : state.status === 'done' ? 'text-gray-600' : 'text-gray-400'}`} />
        <span className={`text-sm font-medium ${state.status === 'active' ? 'text-indigo-700' : state.status === 'done' ? 'text-gray-700' : 'text-gray-400'}`}>
          {meta.label}
        </span>
        {meta.key === 'validation' && state.status === 'done' && state.validation && (
          <span className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-gray-500 uppercase tracking-wide">Persona</span>
            <ScoreBadge score={state.validation.alignment_score} />
            <span className="text-[10px] text-gray-500 uppercase tracking-wide ml-1">Answer</span>
            <ScoreBadge score={state.validation.completeness_score ?? 50} />
          </span>
        )}
        {meta.key === 'retrieval' && state.status === 'done' && state.ragEmpty && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">
            <AlertTriangle className="w-3 h-3" /> No knowledge
          </span>
        )}
        {hasDoneContent && (
          <span className="ml-auto text-gray-400">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
        )}
      </button>

      {expanded && state.status === 'done' && (
        <div className="ml-8 mt-2 text-sm space-y-2">
          {meta.key === 'thinking' && (
            <>
              {state.thinking && (
                <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl p-3 text-indigo-900/80 whitespace-pre-wrap leading-relaxed">
                  {state.thinking}
                </div>
              )}
              {state.searchQueries && state.searchQueries.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {state.searchQueries.map((q, i) => (
                    <span key={i} className="inline-block px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs">{q}</span>
                  ))}
                </div>
              )}
            </>
          )}

          {meta.key === 'retrieval' && (
            <>
              {state.ragEmpty && (
                <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3 text-yellow-800 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>No knowledge documents were loaded (no extended profile, blueprint files, session inputs, or runner business profile). The reply may rely only on the short persona line in the system prompt.</span>
                </div>
              )}
              {state.chunks && state.chunks.length > 0 && (
                <div className="space-y-1.5">
                  {state.chunks.slice(0, 5).map((c, i) => (
                    <div key={i} className="flex items-start gap-2 bg-gray-50 border border-gray-100 rounded-lg p-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium text-gray-700">{c.source_name || c.source_type}</span>
                          <span className="text-gray-400">
                            {c.source_type.startsWith('full_') ? 'full document' : `${Math.round(c.score * 100)}%`}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{c.preview}</p>
                      </div>
                    </div>
                  ))}
                  {state.chunks.length > 5 && (
                    <p className="text-xs text-gray-400">+{state.chunks.length - 5} more documents</p>
                  )}
                </div>
              )}
            </>
          )}

          {meta.key === 'responding' && state.response && (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-gray-700 whitespace-pre-wrap leading-relaxed max-h-40 overflow-y-auto">
              {state.response.slice(0, 500)}{state.response.length > 500 ? '...' : ''}
            </div>
          )}

          {meta.key === 'validation' && state.validation && (
            <div className="space-y-2">
              {state.validation.alignment_score < 50 && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-red-800 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>This response may not fully align with the persona's profile. Review the flags below.</span>
                </div>
              )}
              {(state.validation.completeness_score ?? 50) < 50 && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-900 text-xs">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>The reply may not fully answer the user or may be too thin, evasive, or incomplete.</span>
                </div>
              )}
              {state.validation.flags.length > 0 && (
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Persona</p>
              )}
              {state.validation.flags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {state.validation.flags.map((f, i) => (
                    <span key={i} className="inline-block px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full text-xs">{f}</span>
                  ))}
                </div>
              )}
              {state.validation.suggestions.length > 0 && (
                <div className="space-y-1">
                  {state.validation.suggestions.map((s, i) => (
                    <p key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <Sparkles className="w-3 h-3 text-indigo-400 flex-shrink-0 mt-0.5" />
                      {s}
                    </p>
                  ))}
                </div>
              )}
              {((state.validation.completeness_flags?.length ?? 0) > 0 ||
                (state.validation.completeness_suggestions?.length ?? 0) > 0) && (
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide pt-1">Answer completeness</p>
              )}
              {(state.validation.completeness_flags ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {(state.validation.completeness_flags ?? []).map((f, i) => (
                    <span key={i} className="inline-block px-2 py-0.5 bg-amber-100 text-amber-900 rounded-full text-xs">{f}</span>
                  ))}
                </div>
              )}
              {(state.validation.completeness_suggestions ?? []).length > 0 && (
                <div className="space-y-1">
                  {(state.validation.completeness_suggestions ?? []).map((s, i) => (
                    <p key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                      <Sparkles className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                      {s}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const AgentPipelineViewer: React.FC<Props> = ({ events, isActive, compact = false }) => {
  const steps = buildSteps(events);
  const isComplete = events.some(e => e.step === 'complete');

  if (events.length === 0 && !isActive) return null;

  return (
    <div className={`${compact ? 'px-3 py-2' : 'px-4 py-3'} bg-white border border-gray-200 rounded-2xl shadow-sm ${isComplete ? 'opacity-90' : ''}`}>
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-xs font-semibold ${isActive ? 'text-indigo-600' : 'text-gray-500'}`}>
          {isActive ? 'Agent Pipeline' : 'Pipeline Complete'}
        </span>
        {isActive && <Loader2 className="w-3 h-3 text-indigo-500 animate-spin" />}
      </div>
      <div className="divide-y divide-gray-100">
        {STEP_META.map(meta => (
          <StepRow key={meta.key} meta={meta} state={steps[meta.key]} compact={compact} />
        ))}
      </div>
    </div>
  );
};

export default AgentPipelineViewer;
