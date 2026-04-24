
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Send, Plus, User, Bot, Loader2, ArrowLeft, MoreVertical, Trash2, History, Users, X, MessageSquare, XCircle } from 'lucide-react';
import { useAvailablePersonas } from '../hooks/usePersonas.js';
import { useChatSessions } from '../hooks/useChatSessions.js';
import { chatApi } from '../services/chatApi.js';
import { personaApi } from '../services/personaApi.js';
import { focusGroupApi } from '../services/focusGroupApi.js';
import { geminiService } from '../services/gemini.js';
import { agentApi, finalizePipelineEvents, pipelineEventsFromStoredMessage } from '../services/agentApi.js';
import type { AgentPipelineEvent } from '../services/agentApi.js';
import AgentPipelineViewer from '../components/AgentPipelineViewer.js';
import { Persona, ChatSession, Message, FocusGroup } from '../models/types.js';
import { getPersonaDisplayName } from '../utils/humanNames.js';

/**
 * A simple internal component to render basic markdown-style formatting
 * without adding heavy external dependencies.
 */
const FormattedContent: React.FC<{ content: string; isUser?: boolean }> = ({ content, isUser = false }) => {
  // Split into paragraphs/lines while preserving intentional breaks
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

const ChatPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [selectedPersonas, setSelectedPersonas] = useState<Persona[]>([]);
  const [focusGroups, setFocusGroups] = useState<FocusGroup[]>([]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeResponders, setActiveResponders] = useState<string[]>([]);
  const [chatPipelineEvents, setChatPipelineEvents] = useState<AgentPipelineEvent[]>([]);
  const [chatPipelineActive, setChatPipelineActive] = useState(false);
  const { personas: allPersonas } = useAvailablePersonas();
  const { sessions: pastSessions, fetchSessions } = useChatSessions();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Save session to localStorage when it changes
  useEffect(() => {
    if (session) {
      localStorage.setItem('chatActiveSessionId', session.id);
    } else {
      localStorage.removeItem('chatActiveSessionId');
    }
  }, [session]);

  useEffect(() => {
    const init = async () => {
      fetchSessions();
      const initialPersonaId = searchParams.get('personaId');
      
      // Try to restore last active session if no personaId in URL
      if (!initialPersonaId) {
        const savedSessionId = localStorage.getItem('chatActiveSessionId');
        if (savedSessionId) {
          try {
            const savedSession = await chatApi.getSession(savedSessionId);
            if (savedSession) {
              const normalized = {
                ...savedSession,
                createdAt: savedSession.created_at || savedSession.createdAt,
                personaIds: savedSession.persona_ids || savedSession.personaIds || [],
              };
              // Wait for allPersonas to be loaded before restoring session
              if (allPersonas.length > 0) {
                await handleLoadSession(normalized);
              } else {
                // If personas aren't loaded yet, wait a bit and try again
                setTimeout(async () => {
                  if (allPersonas.length > 0) {
                    await handleLoadSession(normalized);
                  }
                }, 500);
              }
              return;
            }
          } catch (err) {
            console.error('Failed to restore session:', err);
            localStorage.removeItem('chatActiveSessionId');
          }
        }
      }
      
      if (initialPersonaId && allPersonas.length > 0) {
        const p = allPersonas.find(x => x.id === initialPersonaId);
        if (p) {
          setSelectedPersonas([p]);
          await handleStartChat([p]);
        }
      }
    };
    if (allPersonas.length > 0) {
      init();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, allPersonas]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeResponders]);

  useEffect(() => {
    if (isSelectorOpen) {
      focusGroupApi.getAll().then(setFocusGroups).catch(() => setFocusGroups([]));
    }
  }, [isSelectorOpen]);

  // Adjust textarea height as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleLoadSession = async (s: ChatSession) => {
    try {
      // Load personas FIRST before setting session to avoid showing "0 Agents Active"
      let personasWithFiles: Persona[] = [];
      const cachedPersonas = localStorage.getItem(`chatPersonas_${s.id}`);
      if (cachedPersonas) {
        try {
          personasWithFiles = JSON.parse(cachedPersonas);
          console.log('Loaded personas from cache:', personasWithFiles.length);
        } catch (err) {
          console.error('Failed to parse cached personas:', err);
        }
      }
      
      // If no cached personas or cache is empty, load from backend
      if (personasWithFiles.length === 0) {
        console.log('Loading personas from backend for session:', s.id);
        // Load full persona data from backend (includes all persona info)
        const sessionPersonas = await chatApi.getSessionPersonas(s.id);
        console.log('Session personas from API:', sessionPersonas.length);
        
        if (sessionPersonas.length === 0) {
          console.warn('No personas found for session:', s.id);
          // Try to get persona IDs from the session itself
          const personaIds = s.personaIds || s.persona_ids || [];
          if (personaIds.length > 0) {
            console.log('Found persona IDs in session, loading from allPersonas:', personaIds);
            // Fallback: try to find personas from allPersonas list
            personasWithFiles = allPersonas.filter(p => personaIds.includes(p.id));
            console.log('Found personas from allPersonas:', personasWithFiles.length);
            
            // Load files for personas found from allPersonas
            if (personasWithFiles.length > 0) {
              personasWithFiles = await Promise.all(
                personasWithFiles.map(async (persona) => {
                  if (!persona.files || persona.files.length === 0) {
                    try {
                      const files = await personaApi.getFiles(persona.id);
                      return {
                        ...persona,
                        files: files.map(f => ({
                          ...f,
                          createdAt: f.created_at || f.createdAt,
                        })),
                      };
                    } catch (err) {
                      console.error(`Failed to load files for persona ${persona.id}:`, err);
                      return persona;
                    }
                  }
                  return persona;
                })
              );
            }
          }
        } else {
          // Normalize persona data
          const normalizedPersonas = sessionPersonas.map(p => ({
            ...p,
            avatarUrl: p.avatar_url || p.avatarUrl,
            createdAt: p.created_at || p.createdAt,
            updatedAt: p.updated_at || p.updatedAt,
            files: p.files || [],
          }));
          
          // Load files for each persona if not already loaded
          personasWithFiles = await Promise.all(
            normalizedPersonas.map(async (persona) => {
              if (!persona.files || persona.files.length === 0) {
                try {
                  const files = await personaApi.getFiles(persona.id);
                  return {
                    ...persona,
                    files: files.map(f => ({
                      ...f,
                      createdAt: f.created_at || f.createdAt,
                    })),
                  };
                } catch (err) {
                  console.error(`Failed to load files for persona ${persona.id}:`, err);
                  return persona;
                }
              }
              return persona;
            })
          );
          
          // Save persona data to localStorage for quick restoration
          localStorage.setItem(`chatPersonas_${s.id}`, JSON.stringify(personasWithFiles));
        }
      }
      
      // Set personas FIRST, then session and messages
      console.log('Setting selectedPersonas:', personasWithFiles.length);
      setSelectedPersonas(personasWithFiles);
      
      // Now load messages
      const msgs = await chatApi.getMessages(s.id);
      // Normalize messages
      const normalized = msgs.map(m => ({
        ...m,
        sessionId: m.session_id || m.sessionId,
        senderType: m.sender_type || m.senderType,
        personaId: m.persona_id || m.personaId,
        createdAt: m.created_at || m.createdAt,
      }));
      setMessages(normalized);
      
      // Set session last to ensure personas are already set
      setSession(s);
      setIsSelectorOpen(false);
    } catch (err) {
      console.error('Failed to load session:', err);
      alert('Failed to load chat session. Please try again.');
    }
  };

  const handleStartChat = async (personas: Persona[]) => {
    if (personas.length === 0) return;
    try {
      // Ensure personas have their files loaded
      const personasWithFiles = await Promise.all(
        personas.map(async (persona) => {
          if (!persona.files || persona.files.length === 0) {
            try {
              const files = await personaApi.getFiles(persona.id);
              return {
                ...persona,
                files: files.map(f => ({
                  ...f,
                  createdAt: f.created_at || f.createdAt,
                })),
              };
            } catch (err) {
              console.error(`Failed to load files for persona ${persona.id}:`, err);
              return persona;
            }
          }
          return persona;
        })
      );
      
      const newSession = await chatApi.createSession(
        `Chat with ${personasWithFiles.map(p => getPersonaDisplayName(p)).join(', ')}`,
        personasWithFiles.map(p => p.id)
      );
      // Normalize session data
      const normalized = {
        ...newSession,
        createdAt: newSession.created_at || newSession.createdAt,
        personaIds: newSession.persona_ids || newSession.personaIds,
      };
      setSession(normalized);
      setSelectedPersonas(personasWithFiles);
      setMessages([]);
      setIsSelectorOpen(false);
      
      // Save persona data to localStorage for quick restoration
      localStorage.setItem(`chatPersonas_${normalized.id}`, JSON.stringify(personasWithFiles));
      
      fetchSessions();
    } catch (err) {
      console.error('Failed to create chat session:', err);
      alert('Failed to start chat. Please try again.');
    }
  };

  const sendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !session || isLoading) return;

    const currentInput = input;
    const userMessage: Message = {
      id: crypto.randomUUID(),
      sessionId: session.id,
      senderType: 'user',
      content: currentInput,
      createdAt: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    try {
      await chatApi.createMessage(session.id, {
        senderType: 'user',
        content: currentInput,
      });
    } catch (err) {
      console.error('Failed to save user message:', err);
    }
    setInput('');
    setIsLoading(true);

    try {
      for (const persona of selectedPersonas) {
        setActiveResponders(prev => [...prev, persona.id]);

        const allCurrentMessages = await chatApi.getMessages(session.id);
        const normalizedMessages = allCurrentMessages.map(m => ({
          ...m,
          sessionId: m.session_id || m.sessionId,
          senderType: m.sender_type || m.senderType,
          personaId: m.persona_id || m.personaId,
          createdAt: m.created_at || m.createdAt,
        }));

        const hasLatestMessage = normalizedMessages.some(m =>
          m.id === userMessage.id ||
          (m.senderType === 'user' && m.content === currentInput &&
           Math.abs(new Date(m.createdAt).getTime() - new Date(userMessage.createdAt).getTime()) < 5000)
        );

        let messagesForHistory = normalizedMessages;
        if (!hasLatestMessage) {
          messagesForHistory = [...normalizedMessages, {
            ...userMessage,
            sessionId: userMessage.sessionId || session.id,
            senderType: userMessage.senderType,
            personaId: userMessage.personaId || '',
            createdAt: userMessage.createdAt,
          }];
        }

        const historyLimit = 20;
        const recentMessages = messagesForHistory.slice(-historyLimit);
        const history = recentMessages.map(m => ({
          role: m.senderType === 'user' ? 'user' as const : 'model' as const,
          text: m.content,
        }));

        const chatTurnCollected: AgentPipelineEvent[] = [];
        setChatPipelineEvents([]);
        setChatPipelineActive(true);
        const agentResult = await agentApi.turnStream(
          {
            personaId: persona.id,
            personaIds: selectedPersonas.map((p) => p.id),
            sessionId: session.id,
            history,
            userMessage: currentInput,
          },
          (ev) => {
            chatTurnCollected.push(ev);
            setChatPipelineEvents((prev) => [...prev, ev]);
          }
        );
        setChatPipelineActive(false);
        const responseText = agentResult.response;
        const turnPipeline = finalizePipelineEvents(chatTurnCollected, agentResult);

        const aiMessage: Message = {
          id: crypto.randomUUID(),
          sessionId: session.id,
          senderType: 'persona',
          personaId: persona.id,
          content: responseText,
          createdAt: new Date().toISOString(),
          thinking: agentResult.thinking || undefined,
          retrieval_summary: agentResult.retrieval,
          validation: agentResult.validation ?? undefined,
          pipeline_events: turnPipeline,
        };

        setMessages(prev => [...prev, aiMessage]);
        try {
          await chatApi.createMessage(session.id, {
            senderType: 'persona',
            personaId: persona.id,
            content: responseText,
          });
        } catch (err) {
          console.error('Failed to save AI message:', err);
        }
        setActiveResponders(prev => prev.filter(id => id !== persona.id));
      }
    } catch (err) {
      console.error(err);
      setChatPipelineActive(false);
      alert('Responders failed due to size limits or API error.');
    } finally {
      setIsLoading(false);
      setActiveResponders([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!session) return;
    
    try {
      await chatApi.deleteMessage(session.id, messageId);
      setMessages(prev => prev.filter(m => m.id !== messageId));
    } catch (err) {
      console.error('Failed to delete message:', err);
      alert('Failed to delete message. Please try again.');
    }
  };

  const handleNewChat = () => {
    setIsSelectorOpen(true);
    setSession(null);
    setMessages([]);
    setSelectedPersonas([]);
  };

  const getPersonaById = (id: string) => {
    return allPersonas.find(p => p.id === id);
  };

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-white">
      {/* Sidebar - History */}
      <aside className="hidden md:flex w-80 flex-col border-r border-gray-100 bg-gray-50/50">
        <div className="p-6 border-b border-gray-100 bg-white">
          <button
            onClick={handleNewChat}
            className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100"
          >
            <Plus className="w-4 h-4" /> New Session
          </button>
        </div>
        <div className="flex-grow overflow-y-auto p-4 space-y-2">
           <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4 px-4">Session Logs</h3>
           {pastSessions.sort((a,b) => b.createdAt.localeCompare(a.createdAt)).map(s => (
             <button
               key={s.id}
               onClick={() => handleLoadSession(s)}
               className={`w-full text-left p-4 rounded-2xl text-sm font-bold transition-all flex items-center gap-4 ${session?.id === s.id ? 'bg-white text-indigo-600 shadow-lg border border-gray-100' : 'text-gray-500 hover:bg-white hover:text-gray-900'}`}
             >
               <History className={`w-4 h-4 shrink-0 ${session?.id === s.id ? 'text-indigo-600' : 'opacity-30'}`} />
               <span className="truncate">{s.name}</span>
             </button>
           ))}
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="flex-grow flex flex-col relative bg-white">
        {!session && !isSelectorOpen && (
          <div className="flex-grow flex items-center justify-center p-8 text-center">
            <div className="max-w-md">
              <div className="w-24 h-24 bg-indigo-50 text-indigo-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
                <MessageSquare className="w-10 h-10" />
              </div>
              <h2 className="text-3xl font-black text-gray-900 mb-4">Select Responders</h2>
              <p className="text-gray-500 mb-10 font-medium">Choose which synthetic personas will participate in this intelligence session.</p>
              <button
                onClick={() => setIsSelectorOpen(true)}
                className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-2xl shadow-indigo-100 hover:bg-indigo-700 transition-all uppercase tracking-widest text-sm"
              >
                New Session
              </button>
            </div>
          </div>
        )}

        {session && (
          <>
            {/* Header */}
            <header className="px-8 py-5 border-b border-gray-100 flex items-center justify-between bg-white/80 backdrop-blur-xl sticky top-0 z-20">
              <div className="flex items-center gap-5">
                 <div className="flex -space-x-4">
                   {selectedPersonas.map(p => (
                     <img
                       key={p.id}
                       src={p.avatarUrl}
                       alt={getPersonaDisplayName(p)}
                       className="inline-block h-12 w-12 rounded-2xl ring-4 ring-white object-cover shadow-sm"
                     />
                   ))}
                 </div>
                 <div>
                   <h2 className="font-black text-gray-900 text-lg leading-none mb-1">
                     {selectedPersonas.length > 1 ? `Multi-Persona Intelligence Session` : getPersonaDisplayName(selectedPersonas[0])}
                   </h2>
                   <div className="flex items-center text-[10px] text-green-500 font-black uppercase tracking-widest">
                     <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
                     {selectedPersonas.length} Agents Active
                   </div>
                 </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsSelectorOpen(true)}
                  className="p-3 bg-gray-50 text-gray-400 rounded-xl hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                  title="Manage Session Agents"
                >
                  <Users className="w-5 h-5" />
                </button>
              </div>
            </header>

            {/* Messages Area */}
            <div className="flex-grow overflow-y-auto p-8 space-y-8 bg-gray-50/30">
              {messages.length === 0 && (
                <div className="text-center py-20">
                  <div className="p-6 bg-white border border-gray-100 rounded-3xl inline-block text-gray-400 text-sm font-bold uppercase tracking-widest">
                    Awaiting initial transmission...
                  </div>
                </div>
              )}
              {messages.map((m) => {
                const isUser = m.senderType === 'user';
                const persona = m.personaId ? getPersonaById(m.personaId) : null;
                
                return (
                  <div
                    key={m.id}
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500 group`}
                  >
                    <div className={`flex gap-4 max-w-[90%] sm:max-w-[75%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`shrink-0 mt-1`}>
                        {isUser ? (
                          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-100">
                             <User className="w-6 h-6 text-white" />
                          </div>
                        ) : (
                          <img 
                            src={persona?.avatarUrl || 'https://picsum.photos/seed/bot/200'} 
                            alt={getPersonaDisplayName(persona)} 
                            className="w-10 h-10 rounded-xl object-cover shadow-md border border-white"
                          />
                        )}
                      </div>
                      <div className="space-y-2 min-w-0 flex-grow relative">
                        {!isUser && (
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                            {getPersonaDisplayName(persona)}
                          </p>
                        )}
                        {!isUser && (
                          <AgentPipelineViewer
                            events={pipelineEventsFromStoredMessage(m)}
                            isActive={false}
                            compact
                          />
                        )}
                        <div className={`p-5 rounded-3xl shadow-sm text-base relative ${isUser ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'}`}>
                          <FormattedContent content={m.content} isUser={isUser} />
                          <button
                            onClick={() => handleDeleteMessage(m.id)}
                            className="absolute -top-2 -right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 shadow-lg"
                            title="Delete message"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                        <p className={`text-[10px] text-gray-300 font-medium ${isUser ? 'text-right mr-1' : 'ml-1'}`}>
                          {new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              {/* Active Responders (Loading states) */}
              {activeResponders.map(responderId => {
                const persona = getPersonaById(responderId);
                return (
                  <div key={responderId} className="flex justify-start animate-in fade-in duration-300">
                    <div className="flex gap-4 max-w-[70%]">
                      <div className="shrink-0">
                        <img 
                          src={persona?.avatarUrl || 'https://picsum.photos/seed/bot/200'} 
                          alt={getPersonaDisplayName(persona)} 
                          className="w-10 h-10 rounded-xl object-cover grayscale opacity-50"
                        />
                      </div>
                      <div className="space-y-2">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                          {getPersonaDisplayName(persona)} is processing...
                        </p>
                        <div className="min-w-[280px]">
                          <AgentPipelineViewer events={chatPipelineEvents} isActive={chatPipelineActive} compact />
                        </div>
                        <div className="bg-white border border-gray-100 p-5 rounded-3xl rounded-tl-none flex items-center gap-4 shadow-sm">
                           <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                           <div className="flex gap-1">
                             <span className="w-1.5 h-1.5 bg-indigo-200 rounded-full animate-bounce"></span>
                             <span className="w-1.5 h-1.5 bg-indigo-300 rounded-full animate-bounce [animation-delay:0.2s]"></span>
                             <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce [animation-delay:0.4s]"></span>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-8 border-t border-gray-100 bg-white">
              <form onSubmit={sendMessage} className="max-w-5xl mx-auto flex gap-4">
                <div className="flex-grow relative group">
                  <textarea
                    ref={textareaRef}
                    rows={1}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={isLoading ? "Please wait for responders..." : `Message ${selectedPersonas.length > 1 ? 'the session agents' : getPersonaDisplayName(selectedPersonas[0])}...`}
                    disabled={isLoading}
                    className="w-full px-8 py-5 bg-gray-50 border border-gray-100 rounded-[2rem] font-medium focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:bg-white transition-all pr-20 shadow-inner disabled:opacity-50 resize-none overflow-hidden min-h-[64px]"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isLoading}
                    className="absolute right-3 bottom-3 p-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all disabled:bg-gray-200 disabled:text-gray-400 shadow-xl shadow-indigo-100"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </form>
              <div className="flex items-center justify-center gap-6 mt-4">
                 <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Powered by Gemini 3 Flash Intelligence</p>
                 <div className="h-1 w-1 bg-gray-200 rounded-full"></div>
                 <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Press Enter to send • Shift+Enter for new line</p>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Persona Selector Modal */}
      {isSelectorOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-gray-900/80 backdrop-blur-md" onClick={() => setIsSelectorOpen(false)}></div>
          <div className="relative bg-white w-full max-w-3xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
            <div className="p-10 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-3xl font-black text-gray-900 mb-2">My Personas</h3>
                <p className="text-sm text-gray-500 font-medium">Select up to 5 agents for your synchronous session.</p>
              </div>
              <button onClick={() => setIsSelectorOpen(false)} className="p-3 bg-gray-50 text-gray-400 rounded-2xl hover:text-gray-900 transition-all">
                <X className="w-6 h-6" />
              </button>
            </div>

            {focusGroups.length > 0 && (
              <div className="px-10 py-4 bg-indigo-50/50 border-b border-indigo-100 flex items-center gap-3 flex-wrap">
                <span className="text-sm font-semibold text-gray-700">Add focus group:</span>
                <select
                  className="border border-gray-200 rounded-xl py-2 px-4 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                  value=""
                  onChange={(e) => {
                    const id = e.target.value;
                    e.target.value = '';
                    if (!id) return;
                    const group = focusGroups.find(g => g.id === id);
                    if (!group) return;
                    const toAdd = group.personaIds
                      .map(pid => allPersonas.find(p => p.id === pid))
                      .filter((p): p is Persona => p != null);
                    setSelectedPersonas(prev => {
                      const currentIds = new Set(prev.map(p => p.id));
                      const added: Persona[] = [];
                      for (const p of toAdd) {
                        if (currentIds.size >= 5) break;
                        if (!currentIds.has(p.id)) {
                          currentIds.add(p.id);
                          added.push(p);
                        }
                      }
                      return added.length ? [...prev, ...added] : prev;
                    });
                  }}
                >
                  <option value="">Choose a group...</option>
                  {focusGroups.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.personaIds.length})
                    </option>
                  ))}
                </select>
              </div>
            )}
            
            <div className="flex-grow overflow-y-auto p-10 grid grid-cols-1 sm:grid-cols-2 gap-5 bg-gray-50/50">
              {allPersonas.length > 0 ? allPersonas.map(p => {
                const isSelected = selectedPersonas.some(x => x.id === p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedPersonas(selectedPersonas.filter(x => x.id !== p.id));
                      } else if (selectedPersonas.length < 5) {
                        setSelectedPersonas([...selectedPersonas, p]);
                      }
                    }}
                    className={`flex items-center gap-5 p-5 rounded-3xl border-2 transition-all text-left ${isSelected ? 'border-indigo-600 bg-white shadow-xl shadow-indigo-100/50' : 'border-gray-100 bg-white hover:border-indigo-200'}`}
                  >
                    <img src={p.avatarUrl} alt={getPersonaDisplayName(p)} className="w-14 h-14 rounded-2xl object-cover shrink-0 shadow-sm" />
                    <div className="min-w-0">
                      <p className="font-black text-gray-900 truncate">{getPersonaDisplayName(p)}</p>
                      {(p.description?.trim()) ? <p className="text-xs text-gray-500 truncate mt-0.5">{p.description.trim()}</p> : <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest truncate">{p.type.replace('_', ' ')}</p>}
                    </div>
                  </button>
                );
              }) : (
                <div className="col-span-full text-center py-20 bg-white rounded-[2rem] border-2 border-dashed border-gray-200">
                   <Users className="w-12 h-12 text-gray-200 mx-auto mb-6" />
                   <p className="text-gray-500 font-bold mb-6">You have no personas yet.</p>
                   <Link to="/build" className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">Create Blueprint</Link>
                </div>
              )}
            </div>

            <div className="p-10 border-t border-gray-100 bg-white flex items-center justify-between">
              <span className="text-xs font-black text-gray-400 uppercase tracking-widest">
                {selectedPersonas.length} / 5 AGENTS Ready
              </span>
              <button
                disabled={selectedPersonas.length === 0}
                onClick={() => handleStartChat(selectedPersonas)}
                className="px-10 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-2xl shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-30 transition-all flex items-center gap-3 uppercase tracking-widest text-sm"
              >
                Initiate Session <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
