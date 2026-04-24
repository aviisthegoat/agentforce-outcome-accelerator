
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Send, Plus, User, Bot, Loader2, ArrowLeft, MoreVertical, Trash2, History, Users, X, MessageSquare } from 'lucide-react';
import { storageService } from '../services/storage';
import { geminiService } from '../services/gemini';
import { Persona, ChatSession, Message } from '../types';

/**
 * A simple internal component to render basic markdown-style formatting
 * without adding heavy external dependencies.
 */
const FormattedContent: React.FC<{ content: string }> = ({ content }) => {
  // Split into paragraphs/lines while preserving intentional breaks
  const lines = content.split('\n');
  
  return (
    <div className="space-y-2 whitespace-pre-wrap break-words">
      {lines.map((line, idx) => {
        // Handle bold: **text**
        let processedLine: React.ReactNode[] = [line];
        
        // Very basic bold replacement logic
        const boldRegex = /\*\*(.*?)\*\*/g;
        const matches = [...line.matchAll(boldRegex)];
        
        if (matches.length > 0) {
          processedLine = [];
          let lastIndex = 0;
          matches.forEach((match, mIdx) => {
            const index = match.index!;
            // Text before bold
            if (index > lastIndex) {
              processedLine.push(line.substring(lastIndex, index));
            }
            // Bolded text
            processedLine.push(<strong key={`${idx}-${mIdx}`} className="font-black text-gray-900">{match[1]}</strong>);
            lastIndex = index + match[0].length;
          });
          // Text after last bold
          if (lastIndex < line.length) {
            processedLine.push(line.substring(lastIndex));
          }
        }

        // Handle simple lists (lines starting with - or *)
        const isList = line.trim().startsWith('- ') || line.trim().startsWith('* ');
        
        return (
          <div key={idx} className={isList ? "pl-4 relative" : ""}>
            {isList && <span className="absolute left-0 top-0 text-indigo-500 font-bold">•</span>}
            <span className="leading-relaxed">
              {processedLine}
            </span>
          </div>
        );
      })}
    </div>
  );
};

const ChatPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isSelectorOpen, setIsSelectorOpen] = useState(!searchParams.get('personaId'));
  const [selectedPersonas, setSelectedPersonas] = useState<Persona[]>([]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeResponders, setActiveResponders] = useState<string[]>([]);
  const [allPersonas, setAllPersonas] = useState<Persona[]>([]);
  const [pastSessions, setPastSessions] = useState<ChatSession[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const init = async () => {
      const ps = await storageService.getPersonas();
      setAllPersonas(ps);
      const sessions = await storageService.getSessions();
      setPastSessions(sessions);

      const initialPersonaId = searchParams.get('personaId');
      if (initialPersonaId) {
        const p = ps.find(x => x.id === initialPersonaId);
        if (p) {
          setSelectedPersonas([p]);
          await handleStartChat([p]);
        }
      }
    };
    init();
  }, [searchParams]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activeResponders]);

  // Adjust textarea height as user types
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleStartChat = async (personas: Persona[]) => {
    if (personas.length === 0) return;
    const newSession: ChatSession = {
      id: crypto.randomUUID(),
      name: `Chat with ${personas.map(p => p.name).join(', ')}`,
      personaIds: personas.map(p => p.id),
      createdAt: new Date().toISOString(),
    };
    await storageService.saveSession(newSession);
    setSession(newSession);
    setMessages([]);
    setIsSelectorOpen(false);
    
    // Refresh history
    const sessions = await storageService.getSessions();
    setPastSessions(sessions);
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
    await storageService.saveMessage(userMessage);
    setInput('');
    setIsLoading(true);

    try {
      for (const persona of selectedPersonas) {
        setActiveResponders(prev => [...prev, persona.id]);
        
        let systemPrompt = `You are strictly acting as the persona: ${persona.name}.\n`;
        systemPrompt += `Identity/Title: ${persona.description}\n\n`;
        systemPrompt += `CORE BLUEPRINT DATA:\n`;
        
        for (const file of persona.files) {
          const contentLimit = 50000;
          const truncatedContent = file.content.length > contentLimit 
            ? file.content.substring(0, contentLimit) + "... [Truncated for Context]"
            : file.content;
            
          systemPrompt += `--- FILE: ${file.name} ---\n${truncatedContent}\n\n`;
        }
        systemPrompt += `INSTRUCTIONS: You ARE this persona. Respond naturally to the user's message only as this persona—never describe or reference the persona in your reply; speak in first person as them. Stay in character. Use bolding (**text**) for emphasis and bullet points for lists to ensure your message is easy to read and highly professional.`;

        const allCurrentMessages = await storageService.getMessages(session.id);
        const historyLimit = 20;
        const recentMessages = allCurrentMessages.slice(-historyLimit);
        
        const history = recentMessages.map(m => ({
          role: m.senderType === 'user' ? 'user' as const : 'model' as const,
          text: m.content
        }));

        const responseText = await geminiService.chat(systemPrompt, history, currentInput);

        const aiMessage: Message = {
          id: crypto.randomUUID(),
          sessionId: session.id,
          senderType: 'persona',
          personaId: persona.id,
          content: responseText,
          createdAt: new Date().toISOString(),
        };

        setMessages(prev => [...prev, aiMessage]);
        await storageService.saveMessage(aiMessage);
        setActiveResponders(prev => prev.filter(id => id !== persona.id));
      }
    } catch (err) {
      console.error(err);
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

  const handleLoadSession = async (s: ChatSession) => {
    setSession(s);
    const msgs = await storageService.getMessages(s.id);
    setMessages(msgs);
    const ps = allPersonas.filter(p => s.personaIds.includes(p.id));
    setSelectedPersonas(ps);
    setIsSelectorOpen(false);
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
                Open My Personas
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
                       alt={p.name}
                       className="inline-block h-12 w-12 rounded-2xl ring-4 ring-white object-cover shadow-sm"
                     />
                   ))}
                 </div>
                 <div>
                   <h2 className="font-black text-gray-900 text-lg leading-none mb-1">
                     {selectedPersonas.length > 1 ? `Multi-Persona Intelligence Session` : selectedPersonas[0]?.name}
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
                    className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}
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
                            alt={persona?.name || 'Bot'} 
                            className="w-10 h-10 rounded-xl object-cover shadow-md border border-white"
                          />
                        )}
                      </div>
                      <div className="space-y-1 min-w-0 flex-grow">
                        {!isUser && (
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                            {persona?.name || 'Assistant'}
                          </p>
                        )}
                        <div className={`p-5 rounded-3xl shadow-sm text-base ${isUser ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none'}`}>
                          <FormattedContent content={m.content} />
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
                          alt={persona?.name} 
                          className="w-10 h-10 rounded-xl object-cover grayscale opacity-50"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">
                          {persona?.name} is processing...
                        </p>
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
                    placeholder={isLoading ? "Please wait for responders..." : `Message ${selectedPersonas.length > 1 ? 'the session agents' : selectedPersonas[0]?.name}...`}
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
                    <img src={p.avatarUrl} alt={p.name} className="w-14 h-14 rounded-2xl object-cover shrink-0 shadow-sm" />
                    <div className="min-w-0">
                      <p className="font-black text-gray-900 truncate">{p.name}</p>
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
