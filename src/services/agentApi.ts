import { apiClient } from './api.js';

export interface AgentTurnRequest {
  personaId: string;
  personaIds?: string[];
  sessionId?: string;
  history: { role: 'user' | 'model'; text: string }[];
  userMessage: string;
  simulationInstructions?: string;
  previousThinking?: string;
  image?: string;
  mimeType?: string;
}

export interface RetrievalInfo {
  queries: string[];
  chunks: { source_type: string; source_name: string; score: number; preview: string }[];
  ragEmpty: boolean;
}

export interface ValidationInfo {
  alignment_score: number;
  completeness_score: number;
  flags: string[];
  suggestions: string[];
  completeness_flags: string[];
  completeness_suggestions: string[];
}

export interface AgentTurnResponse {
  response: string;
  thinking: string;
  retrieval: RetrievalInfo;
  validation: ValidationInfo | null;
}

export interface AgentPipelineEvent {
  step: 'thinking' | 'retrieval' | 'responding' | 'validation' | 'complete';
  status?: 'active' | 'done';
  thinking?: string;
  searchQueries?: string[];
  queries?: string[];
  chunks?: { source_type: string; source_name: string; score: number; preview: string }[];
  ragEmpty?: boolean;
  response?: string;
  validation?: ValidationInfo;
  result?: AgentTurnResponse;
}

function isDonePipelineStep(
  ev: AgentPipelineEvent,
  step: 'thinking' | 'retrieval' | 'responding' | 'validation'
): boolean {
  return ev.step === step && ev.status === 'done';
}

/** Rebuild the four visible pipeline steps (+ complete) from a finished turn (e.g. non-streaming JSON). */
export function pipelineEventsFromTurnResult(result: AgentTurnResponse): AgentPipelineEvent[] {
  const searchQueries = result.retrieval?.queries?.length ? result.retrieval.queries : [];
  const thinking = result.thinking || '';
  const chunks = result.retrieval?.chunks ?? [];
  const ragEmpty = result.retrieval?.ragEmpty ?? true;
  const response = result.response || '';
  const validation =
    result.validation ?? {
      alignment_score: 50,
      completeness_score: 50,
      flags: [] as string[],
      suggestions: [] as string[],
      completeness_flags: [] as string[],
      completeness_suggestions: [] as string[],
    };
  return [
    { step: 'thinking', status: 'done', thinking, searchQueries },
    { step: 'retrieval', status: 'done', chunks, ragEmpty },
    { step: 'responding', status: 'done', response },
    { step: 'validation', status: 'done', validation },
    { step: 'complete', status: 'done', result },
  ];
}

/** Prefer streamed step events; if the stream was JSON-only, synthesize from the final result. */
export function finalizePipelineEvents(
  collected: AgentPipelineEvent[],
  result: AgentTurnResponse
): AgentPipelineEvent[] {
  if (
    collected.some((e) => isDonePipelineStep(e, 'thinking')) &&
    collected.some((e) => isDonePipelineStep(e, 'retrieval')) &&
    collected.some((e) => isDonePipelineStep(e, 'responding')) &&
    collected.some((e) => isDonePipelineStep(e, 'validation'))
  ) {
    if (collected.some((e) => e.step === 'complete')) return collected;
    return [...collected, { step: 'complete', status: 'done' as const, result }];
  }
  return pipelineEventsFromTurnResult(result);
}

/** Restore or synthesize pipeline events for a persisted message. */
export function pipelineEventsFromStoredMessage(m: {
  content: string;
  thinking?: string;
  retrieval_summary?: RetrievalInfo | null;
  validation?: ValidationInfo | null;
  pipeline_events?: AgentPipelineEvent[] | null;
}): AgentPipelineEvent[] {
  if (m.pipeline_events && Array.isArray(m.pipeline_events) && m.pipeline_events.length > 0) {
    return m.pipeline_events;
  }
  return pipelineEventsFromTurnResult({
    response: m.content,
    thinking: m.thinking || '',
    retrieval: m.retrieval_summary || { queries: [], chunks: [], ragEmpty: true },
    validation: m.validation ?? null,
  });
}

/** Same as stored message, for multi-persona result cards (`retrieval` field). */
export function pipelineEventsFromPersonaResult(pr: {
  content: string;
  thinking?: string;
  retrieval?: RetrievalInfo | null;
  validation?: ValidationInfo | null;
  pipeline_events?: AgentPipelineEvent[] | null;
}): AgentPipelineEvent[] {
  if (pr.pipeline_events && pr.pipeline_events.length > 0) return pr.pipeline_events;
  return pipelineEventsFromStoredMessage({
    content: pr.content,
    thinking: pr.thinking,
    retrieval_summary: pr.retrieval ?? null,
    validation: pr.validation ?? null,
  });
}

export const agentApi = {
  turn: async (params: AgentTurnRequest): Promise<AgentTurnResponse> => {
    return apiClient.post<AgentTurnResponse>('/agent/turn', params);
  },

  turnStream: async (
    params: AgentTurnRequest,
    onEvent: (event: AgentPipelineEvent) => void
  ): Promise<AgentTurnResponse> => {
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
    const token = localStorage.getItem('auth_token');
    const response = await fetch(`${baseUrl}/agent/turn?stream=1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/x-ndjson',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const text = await response.text();
        const parsed = JSON.parse(text);
        errMsg = parsed.message || parsed.error || errMsg;
      } catch { /* use default */ }
      throw new Error(errMsg);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data = await response.json();
      onEvent({ step: 'complete', status: 'done', result: data });
      return data;
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Streaming not supported by this browser');

    const decoder = new TextDecoder();
    let buffer = '';
    let finalResult: AgentTurnResponse | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) {
          try {
            const event: AgentPipelineEvent = JSON.parse(line);
            onEvent(event);
            if (event.step === 'complete' && event.result) {
              finalResult = event.result;
            }
          } catch { /* skip malformed lines */ }
        }
      }
    }
    if (buffer.trim()) {
      try {
        const event: AgentPipelineEvent = JSON.parse(buffer);
        onEvent(event);
        if (event.step === 'complete' && event.result) {
          finalResult = event.result;
        }
      } catch { /* skip */ }
    }

    if (!finalResult) {
      throw new Error('Stream ended without a complete event');
    }
    return finalResult;
  },

  indexContext: async (sessionId: string, fields: Record<string, string>): Promise<void> => {
    await apiClient.post('/agent/index-context', { sessionId, fields });
  },

  retrieve: async (
    query: string,
    personaIds: string[],
    sessionId?: string,
    topK?: number
  ): Promise<{ chunks: { text: string; source_type: string; source_name: string; score: number }[] }> => {
    return apiClient.post('/agent/retrieve', { query, personaIds, sessionId, topK });
  },

  indexUnindexed: async (): Promise<{ message: string; indexed: number }> => {
    return apiClient.post('/agent/index-unindexed', {});
  },
};
