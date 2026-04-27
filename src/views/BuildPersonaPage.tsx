import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Target, Sparkles, ArrowLeft, Loader2, Upload, ChevronRight, Building2, HelpCircle, FileText, AlertCircle, Linkedin, FileUp, X, Brain, Search, Check, ShieldCheck } from 'lucide-react';
import { personaApi } from '../services/personaApi.js';
import { geminiService, GEMINI_ACCEPTED_MIME_TYPES, GEMINI_FILE_INPUT_ACCEPT } from '../services/gemini.js';
import { getBusinessProfile } from '../services/businessProfileApi.js';
import type { BusinessProfile } from '../models/types.js';
import { businessProfileToPromptString } from '../utils/businessProfile.js';

// Import split templates
import { marketCanvasTemplate } from '../../templates/marketCanvasTemplate.js';
import { jobBuilderTemplate } from '../../templates/jobBuilderTemplate.js';
import { metricsTemplate } from '../../templates/metricsTemplate.js';
import { agentProfileDetailedTemplate } from '../../templates/agentProfileDetailedTemplate.js';
import { agentBehaviorsTemplate } from '../../templates/agentBehaviorsTemplate.js';
import { highFidelityPersonaTemplate } from '../../templates/highFidelityPersonaTemplate.js';

// --- HELPER COMPONENTS ---

const FormItem: React.FC<{ label: string; value: string; onChange: (v: string) => void; textarea?: boolean; placeholder?: string }> = ({ label, value, onChange, textarea, placeholder }) => (
  <div className="space-y-4">
    <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">{label}</label>
    {textarea ? (
      <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-gray-50 border border-gray-100 rounded-3xl p-6 h-40 font-medium focus:ring-4 focus:ring-indigo-100 transition-all outline-none resize-none" />
    ) : (
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-6 font-medium focus:ring-4 focus:ring-indigo-100 transition-all outline-none" />
    )}
  </div>
);

const TypeCard: React.FC<{ title: string; description: string; icon: any; onClick: () => void; theme: string }> = ({ title, description, icon: Icon, onClick, theme }) => {
  const themes: Record<string, string> = {
    indigo: 'hover:border-indigo-600 shadow-indigo-100/50 bg-indigo-50 text-indigo-600',
    violet: 'hover:border-violet-600 shadow-violet-100/50 bg-violet-50 text-violet-600',
    pink: 'hover:border-pink-600 shadow-pink-100/50 bg-pink-50 text-pink-600',
    emerald: 'hover:border-emerald-600 shadow-emerald-100/50 bg-emerald-50 text-emerald-600',
    amber: 'hover:border-amber-600 shadow-amber-100/50 bg-amber-50 text-amber-600',
    sky: 'hover:border-sky-600 shadow-sky-100/50 bg-sky-50 text-sky-600',
  };

  return (
    <button
      onClick={onClick}
      className={`group relative bg-white border border-gray-100 p-10 rounded-[2.5rem] transition-all hover:shadow-2xl hover:-translate-y-2 text-left flex flex-col h-full border-b-8 ${themes[theme].split(' ')[0]}`}
    >
      <div className={`w-20 h-20 rounded-3xl flex items-center justify-center mb-10 transition-all group-hover:scale-110 shadow-lg ${themes[theme].split(' ').slice(2).join(' ')}`}>
        <Icon className="w-10 h-10" />
      </div>
      <h3 className="text-3xl font-bold text-gray-900 mb-4">{title}</h3>
      <p className="text-gray-500 leading-relaxed flex-grow font-medium">{description}</p>
      <div className="mt-10 flex items-center text-sm font-black uppercase tracking-widest text-gray-400 group-hover:text-gray-900 transition-colors">
        Configure Blueprint <ChevronRight className="ml-2 w-4 h-4 transition-transform group-hover:translate-x-1" />
      </div>
    </button>
  );
};

// --- PIPELINE INDICATOR ---

const PIPELINE_STEPS = [
  { label: 'Thinking', icon: Brain },
  { label: 'Knowledge Retrieval', icon: Search },
  { label: 'Generating Response', icon: Sparkles },
  { label: 'Persona Validation', icon: ShieldCheck },
] as const;

function getPipelineStepIndex(loadingStage: string): number {
  if (!loadingStage) return 0;
  const s = loadingStage.toLowerCase();
  if (s.includes('digital likeness') || s.includes('capturing')) return 3;
  if (s.includes('profiling agent') || s.includes('defining behaviors') ||
      s.includes('high-fidelity blueprint') || s.includes('building high')) return 2;
  if (s.includes('job architecture') || s.includes('success metrics') ||
      s.includes('discovering identity') || s.includes('identifying author') ||
      s.includes('extracting text from other') || s.includes('extracting text from document')) return 1;
  return 0;
}

const BuildPipelineIndicator: React.FC<{ loadingStage: string; isAdvisor?: boolean }> = ({ loadingStage, isAdvisor }) => {
  const currentIndex = getPipelineStepIndex(loadingStage);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      <div className={`flex items-center gap-2 px-5 py-3 border-b border-gray-100 ${isAdvisor ? 'bg-violet-50/40' : 'bg-indigo-50/40'}`}>
        <Brain className={`w-4 h-4 ${isAdvisor ? 'text-violet-500' : 'text-indigo-500'}`} />
        <span className={`text-xs font-bold uppercase tracking-widest ${isAdvisor ? 'text-violet-600' : 'text-indigo-600'}`}>Agent Pipeline</span>
        <Loader2 className={`w-3.5 h-3.5 ${isAdvisor ? 'text-violet-500' : 'text-indigo-500'} animate-spin ml-auto`} />
      </div>
      <div className="px-5 py-3 space-y-0.5">
        {PIPELINE_STEPS.map((step, i) => {
          const Icon = step.icon;
          const done = i < currentIndex;
          const active = i === currentIndex;
          return (
            <div key={step.label} className={`flex items-center gap-3 py-2.5 ${i < PIPELINE_STEPS.length - 1 ? 'border-b border-gray-50' : ''}`}>
              <div className="flex-shrink-0 w-7 h-7 flex items-center justify-center">
                {done && <div className="w-7 h-7 rounded-full bg-green-100 flex items-center justify-center"><Check className="w-4 h-4 text-green-600" /></div>}
                {active && <div className={`w-7 h-7 rounded-full ${isAdvisor ? 'bg-violet-100' : 'bg-indigo-100'} flex items-center justify-center`}><Loader2 className={`w-4 h-4 ${isAdvisor ? 'text-violet-600' : 'text-indigo-600'} animate-spin`} /></div>}
                {!done && !active && <div className="w-7 h-7 rounded-full border-2 border-gray-200 flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-gray-200" /></div>}
              </div>
              <Icon className={`w-4 h-4 ${active ? (isAdvisor ? 'text-violet-500' : 'text-indigo-500') : done ? 'text-green-500' : 'text-gray-300'}`} />
              <span className={`text-sm font-semibold ${active ? (isAdvisor ? 'text-violet-700' : 'text-indigo-700') : done ? 'text-gray-700' : 'text-gray-400'}`}>
                {step.label}
              </span>
              {done && <span className="ml-auto text-xs font-medium text-green-600">Complete</span>}
              {active && <span className={`ml-auto text-xs font-medium ${isAdvisor ? 'text-violet-500' : 'text-indigo-500'} animate-pulse`}>In progress...</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** Three ways to generate synthetic users; only one is used per run. */
export type SyntheticBuildMode = 'problem_solution' | 'supporting_docs' | 'business_profile';

const SyntheticUserForm: React.FC<{ onComplete: () => void; defaultVisibility?: 'private' | 'public' }> = ({ onComplete, defaultVisibility = 'private' }) => {
  const [method, setMethod] = useState<SyntheticBuildMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const cancelledRef = useRef(false);
  const [q6FileName, setQ6FileName] = useState('');
  const [createdPersonaIds, setCreatedPersonaIds] = useState<string[] | null>(null);
  const [visibilityChoice, setVisibilityChoice] = useState<'private' | 'public'>(defaultVisibility);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [savedBusinessProfile, setSavedBusinessProfile] = useState<BusinessProfile | null>(null);
  const [businessProfileLoading, setBusinessProfileLoading] = useState(false);
  const [formData, setFormData] = useState({
    q1: '', q2: '', q3: '', q4: '', q5: 'B2B' as 'B2B' | 'B2C', q6: '', q7: 1,
    specificUserType: '', // optional, for business_profile: "specific type of user"
  });

  useEffect(() => {
    if (method === 'business_profile') {
      setBusinessProfileLoading(true);
      getBusinessProfile()
        .then((p) => { setSavedBusinessProfile(p ?? null); })
        .finally(() => setBusinessProfileLoading(false));
    }
  }, [method]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setQ6FileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      // Validate UTF-8 text - remove null bytes that cause encoding errors
      const cleanText = text.replace(/\x00/g, '');
      setFormData(prev => ({ ...prev, q6: cleanText }));
    };
    reader.onerror = () => {
      alert('Error reading file. Please ensure it is a valid text file (e.g., .txt, .md, .csv).');
      setQ6FileName('');
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleCancelGenerate = () => {
    cancelledRef.current = true;
    setLoading(false);
    setLoadingStage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!method) return;
    cancelledRef.current = false;
    setLoading(true);
    try {
      const personaGroupId = crypto.randomUUID();
      let userQInputs: string;
      if (method === 'problem_solution') {
        userQInputs = `Problem: ${formData.q1}\nSolution: ${formData.q2}\nDiff: ${formData.q3}\nExisting: ${formData.q4}\nContext: ${formData.q5}`;
      } else if (method === 'supporting_docs') {
        userQInputs = `Supporting Docs (${q6FileName || 'document'}): ${formData.q6}`;
      } else if (method === 'business_profile') {
        const profileText = savedBusinessProfile ? businessProfileToPromptString(savedBusinessProfile) : 'No business background saved. Add it in Business Profile.';
        const specificPart = formData.specificUserType.trim() ? `\n\nSpecific type of user requested: ${formData.specificUserType.trim()}` : '';
        userQInputs = `Business background:\n${profileText}${specificPart}`;
      }

      setLoadingStage('Synthesizing Market Canvas...');
      const marketCanvas = await geminiService.generateChain(marketCanvasTemplate, { "Strategic Input": userQInputs });
      if (cancelledRef.current) return;

      setLoadingStage('Designing Job Architecture...');
      const jobBuilder = await geminiService.generateChain(jobBuilderTemplate, { "Strategic Analysis": marketCanvas });
      if (cancelledRef.current) return;

      setLoadingStage('Quantifying Success Metrics...');
      const metrics = await geminiService.generateChain(metricsTemplate, { "Context": marketCanvas, "Jobs": jobBuilder });
      if (cancelledRef.current) return;

      const idPrompt = `Identify ${formData.q7} distinct personas from this analysis. For each persona return a real-sounding human name (invented first and last name, e.g. "Sarah Chen", "Marcus Webb") in "name" and their job/role title (e.g. "Project Lead", "Marketing Director") in "title". Do not put job titles in the "name" field—only plausible person names. CRITICAL: Each persona must have a unique full name—no two personas in the list may share the same name. Return JSON: { "personas": [{ "name": string, "title": string }] }. Analysis: ${marketCanvas}`;
      const raw = await geminiService.generateBasic(idPrompt, true);
      if (cancelledRef.current) return;
      const personasRaw = Array.isArray(raw?.personas) ? raw.personas : [];
      const usedNames = new Set<string>();
      const personas: { name: string; title: string }[] = [];
      const rawCandidates = personasRaw.length > 0
        ? personasRaw
        : Array.from({ length: Math.max(1, formData.q7) }, () => ({ title: 'Synthetic Persona' }));
      for (let index = 0; index < rawCandidates.length; index++) {
        if (cancelledRef.current) return;
        const p = rawCandidates[index] as { name?: string; title?: string };
        const titleStr = (typeof p?.title === 'string' && p.title.trim()) ? p.title.trim() : 'Synthetic Persona';
        let nameStr = (typeof p?.name === 'string' && p.name.trim()) ? p.name.trim() : '';
        let name = (nameStr && nameStr !== titleStr) ? nameStr : await geminiService.generatePersonaName(titleStr, Array.from(usedNames));
        if (!name || name === 'Persona') name = titleStr;
        // Ensure uniqueness: if name already used, generate a new one
        while (usedNames.has(name)) {
          name = await geminiService.generatePersonaName(`${titleStr} (alternative)`, Array.from(usedNames));
          if (!name || name === 'Persona') name = `${titleStr} ${usedNames.size + 1}`;
        }
        usedNames.add(name);
        personas.push({ name, title: titleStr });
      }
      if (personas.length === 0) {
        throw new Error('Could not derive personas from AI output. Please retry.');
      }

      const createdIds: string[] = [];
      for (const pInfo of personas) {
        if (cancelledRef.current) return;
        // Vary temperature per persona (0.9–1.1) for more varied profiles and behaviors
        const temperature = 0.9 + Math.random() * 0.2;
        setLoadingStage(`Profiling Agent: ${pInfo.name}...`);
        const profile = await geminiService.generateChain(agentProfileDetailedTemplate, { 
          "Target Persona Name": pInfo.name, 
          "Reference Analysis": `${marketCanvas}\n${jobBuilder}\n${metrics}` 
        }, false, temperature);
        if (cancelledRef.current) return;

        setLoadingStage(`Defining Behaviors: ${pInfo.name}...`);
        const behaviors = await geminiService.generateChain(agentBehaviorsTemplate, { 
          "Target Persona": pInfo.name, 
          "Detailed Profile": profile 
        }, false, temperature);
        if (cancelledRef.current) return;

        setLoadingStage(`Capturing Digital Likeness: ${pInfo.name}...`);
        const avatarUrl = await geminiService.generateAvatar(pInfo.name, pInfo.title);
        if (cancelledRef.current) return;

        const persona = await personaApi.create({
          name: pInfo.name,
          type: 'synthetic_user',
          description: pInfo.title,
          avatarUrl: avatarUrl,
          metadata: { personaGroupId },
        });

        const files = [
          { name: `Job_Builder.md`, content: jobBuilder, type: 'markdown' as const },
          { name: `Metrics.md`, content: metrics, type: 'markdown' as const },
          { name: `10Point_Agent_Profile.md`, content: profile, type: 'markdown' as const },
          { name: `Agent_Behaviors.md`, content: behaviors, type: 'markdown' as const }
        ];

        const fileResults = await Promise.allSettled(
          files.map((file) => personaApi.createFile(persona.id, file))
        );
        const failedFileSaves = fileResults.filter((r) => r.status === 'rejected').length;
        if (failedFileSaves > 0) {
          console.warn(`Persona ${pInfo.name}: ${failedFileSaves} file(s) failed to save`);
        }
        createdIds.push(persona.id);
      }
      setCreatedPersonaIds(createdIds);
    } catch (err: any) {
      if (!cancelledRef.current) {
        console.error('Generation error:', err);
        const errorMessage = err?.message || err?.toString() || 'Unknown error occurred';
        alert(`Generation failed: ${errorMessage}`);
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
      setLoadingStage('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {createdPersonaIds && createdPersonaIds.length > 0 ? (
        <div className="space-y-8">
          <h3 className="text-xl font-bold text-gray-900">Set visibility</h3>
          <p className="text-gray-500">Choose who can discover and use these personas.</p>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="visibility"
                checked={visibilityChoice === 'public'}
                onChange={() => setVisibilityChoice('public')}
                className="border-gray-300 text-indigo-600"
              />
              <span className="font-medium">Public</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="visibility"
                checked={visibilityChoice === 'private'}
                onChange={() => setVisibilityChoice('private')}
                className="border-gray-300 text-indigo-600"
              />
              <span className="font-medium">Private</span>
            </label>
          </div>
          <p className="text-sm text-gray-400">
            {visibilityChoice === 'public' ? 'Everyone can discover and use these personas in My Personas.' : 'Only you can see and use these personas.'}
          </p>
          <button
            type="button"
            disabled={savingVisibility}
            onClick={async () => {
              setSavingVisibility(true);
              try {
                const results = await Promise.allSettled(
                  createdPersonaIds.map((id) => personaApi.update(id, { visibility: visibilityChoice }))
                );
                const failed = results.filter((r) => r.status === 'rejected').length;
                if (failed > 0) {
                  throw new Error(`${failed} persona${failed > 1 ? 's' : ''} failed to save visibility`);
                }
                onComplete();
              } catch (err: any) {
                alert(err?.message || 'Failed to save visibility');
              } finally {
                setSavingVisibility(false);
              }
            }}
            className="w-full py-6 bg-indigo-600 text-white font-black text-lg rounded-3xl shadow-xl hover:bg-indigo-700 disabled:opacity-50 transition-all"
          >
            {savingVisibility ? <Loader2 className="animate-spin mx-auto" /> : 'Save and go to My Personas'}
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold text-gray-900">Building Your Personas</h3>
            <p className="text-gray-500 font-medium">Our AI agents are working together to craft your synthetic personas.</p>
          </div>

          <BuildPipelineIndicator loadingStage={loadingStage} />

          <div className="flex items-center justify-center gap-3 bg-indigo-50/60 border border-indigo-100 rounded-2xl px-5 py-4">
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin flex-shrink-0" />
            <span className="text-sm font-semibold text-indigo-700">{loadingStage}</span>
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleCancelGenerate}
              className="flex items-center justify-center gap-2 px-8 py-3 border-2 border-red-200 text-red-600 rounded-2xl font-bold hover:bg-red-50 transition-all"
            >
              <X className="w-5 h-5" />
              Cancel Generation
            </button>
          </div>
        </div>
      ) : (
      <>
      {method == null ? (
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-gray-900">How do you want to generate synthetic users?</h3>
          <p className="text-gray-500">Pick one method. Each run uses only that input.</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={() => setMethod('problem_solution')}
              className="group bg-white border-2 border-gray-100 hover:border-amber-400 p-6 rounded-2xl text-left transition-all hover:shadow-lg"
            >
              <HelpCircle className="w-10 h-10 text-amber-500 mb-3" />
              <h4 className="font-bold text-gray-900 mb-1">Problem / Solution</h4>
              <p className="text-sm text-gray-500">Define problem, solution, differentiation, and alternatives.</p>
            </button>
            <button
              type="button"
              onClick={() => setMethod('supporting_docs')}
              className="group bg-white border-2 border-gray-100 hover:border-sky-400 p-6 rounded-2xl text-left transition-all hover:shadow-lg"
            >
              <FileText className="w-10 h-10 text-sky-500 mb-3" />
              <h4 className="font-bold text-gray-900 mb-1">Supporting Docs</h4>
              <p className="text-sm text-gray-500">Upload business plans, market research, or strategy docs.</p>
            </button>
            <button
              type="button"
              onClick={() => setMethod('business_profile')}
              className="group bg-white border-2 border-gray-100 hover:border-emerald-400 p-6 rounded-2xl text-left transition-all hover:shadow-lg"
            >
              <Building2 className="w-10 h-10 text-emerald-500 mb-3" />
              <h4 className="font-bold text-gray-900 mb-1">Business background</h4>
              <p className="text-sm text-gray-500">Use your saved company/business background from Business Profile; optionally specify a user type.</p>
            </button>
          </div>
        </div>
      ) : (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => setMethod(null)} className="text-sm font-bold text-gray-400 hover:text-indigo-600 uppercase tracking-widest">
            ← Change method
          </button>
        </div>

        {method === 'problem_solution' && (
          <>
            <FormItem label="Problem / question" value={formData.q1} onChange={v => setFormData({ ...formData, q1: v })} textarea placeholder="What problem or question are you exploring?" />
            <FormItem label="Solution / hypothesis" value={formData.q2} onChange={v => setFormData({ ...formData, q2: v })} textarea placeholder="Proposed solution or direction..." />
            <FormItem label="Differentiation" value={formData.q3} onChange={v => setFormData({ ...formData, q3: v })} textarea placeholder="What makes this different?" />
            <FormItem label="Existing alternatives" value={formData.q4} onChange={v => setFormData({ ...formData, q4: v })} textarea placeholder="What exists today?" />
            <div className="space-y-4">
              <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Context</label>
              <select value={formData.q5} onChange={e => setFormData({ ...formData, q5: e.target.value as 'B2B' | 'B2C' })} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-5 font-bold">
                <option value="B2B">B2B</option>
                <option value="B2C">B2C</option>
              </select>
            </div>
            <div className="space-y-4">
              <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Generation count</label>
              <select value={formData.q7} onChange={e => setFormData({ ...formData, q7: parseInt(e.target.value) })} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-5 font-bold">
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} Agent{n > 1 ? 's' : ''}</option>)}
              </select>
            </div>
          </>
        )}

        {method === 'supporting_docs' && (
          <>
            <div className="space-y-4">
              <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Supporting docs (required)</label>
              <div className="border-4 border-dashed border-gray-100 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center hover:border-sky-300 transition-all bg-gray-50/50 group">
                <Upload className="w-12 h-12 text-gray-300 mb-4 group-hover:text-sky-500" />
                <p className="text-lg font-bold text-gray-600 mb-4">Upload business plan, market research, or other strategy docs</p>
                <input type="file" id="sd-file" className="hidden" onChange={handleFile} />
                <label htmlFor="sd-file" className="cursor-pointer px-8 py-3 bg-sky-600 text-white font-bold rounded-2xl shadow-lg hover:bg-sky-700 transition-colors">{q6FileName || 'Select Document'}</label>
              </div>
            </div>
            <div className="space-y-4">
              <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Generation count</label>
              <select value={formData.q7} onChange={e => setFormData({ ...formData, q7: parseInt(e.target.value) })} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-5 font-bold">
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} Agent{n > 1 ? 's' : ''}</option>)}
              </select>
            </div>
          </>
        )}

        {method === 'business_profile' && (
          <>
            {businessProfileLoading ? (
              <div className="flex items-center justify-center py-8 text-gray-500"><Loader2 className="animate-spin w-8 h-8 mr-2" /> Loading business background...</div>
            ) : savedBusinessProfile ? (
              <div className="rounded-2xl bg-gray-50 border border-gray-100 p-6 space-y-2">
                <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest">Using your saved business background</h4>
                <p className="text-sm text-gray-600 font-medium">{savedBusinessProfile.business_name || 'Unnamed'} — {savedBusinessProfile.industry_served || 'No industry'}. Other details from Business Profile will be included in generation.</p>
              </div>
            ) : (
              <div className="rounded-2xl bg-amber-50 border border-amber-200 p-6">
                <p className="text-amber-800 font-medium">No business background saved. Add it in Business Profile, then return here.</p>
              </div>
            )}
            <FormItem
              label="Specific type of user (optional)"
              value={formData.specificUserType}
              onChange={v => setFormData({ ...formData, specificUserType: v })}
              placeholder="e.g. enterprise buyers, SMB decision-makers, end consumers in healthcare"
            />
            <div className="space-y-4">
              <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Generation count</label>
              <select value={formData.q7} onChange={e => setFormData({ ...formData, q7: parseInt(e.target.value) })} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-5 font-bold">
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} Agent{n > 1 ? 's' : ''}</option>)}
              </select>
            </div>
          </>
        )}

      </div>
      )}

      {method != null && (
      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={
            loading ||
            (method === 'problem_solution' && (!formData.q1.trim() || !formData.q2.trim() || !formData.q3.trim() || !formData.q4.trim())) ||
            (method === 'supporting_docs' && !formData.q6.trim()) ||
            (method === 'business_profile' && !savedBusinessProfile)
          }
          className="flex-1 min-w-[200px] py-6 bg-indigo-600 text-white font-black text-lg rounded-3xl shadow-xl hover:bg-indigo-700 disabled:opacity-50 transition-all"
        >
          Submit Blueprint
        </button>
      </div>
      )}
      </>
      )}
    </form>
  );
};

// --- ADVISOR FORM ---
type AdvisorSourceMode = 'linkedin' | 'pdf';

const AdvisorForm: React.FC<{ onComplete: () => void; defaultVisibility?: 'private' | 'public' }> = ({ onComplete, defaultVisibility = 'private' }) => {
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const cancelledRef = useRef(false);
  const [createdPersonaIds, setCreatedPersonaIds] = useState<string[] | null>(null);
  const [visibilityChoice, setVisibilityChoice] = useState<'private' | 'public'>(defaultVisibility);
  const [savingVisibility, setSavingVisibility] = useState(false);
  const [sourceMode, setSourceMode] = useState<AdvisorSourceMode | null>(null);
  const [linkedinText, setLinkedinText] = useState('');
  const [otherDocsFileName, setOtherDocsFileName] = useState('');
  const [otherDocsFileContent, setOtherDocsFileContent] = useState('');
  const [otherDocsFileBase64, setOtherDocsFileBase64] = useState('');
  const [otherDocsFileMimeType, setOtherDocsFileMimeType] = useState('');
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState('');
  const [fileBase64, setFileBase64] = useState<string>('');
  const [fileMimeType, setFileMimeType] = useState<string>('');

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (limit to 20MB)
    const maxSize = 20 * 1024 * 1024; // 20MB
    if (file.size > maxSize) {
      alert(`File size (${Math.round(file.size / 1024 / 1024)}MB) exceeds the maximum allowed size of 20MB. Please use a smaller file.`);
      return;
    }

    if (file.size === 0) {
      alert('The selected file is empty. Please select a valid file.');
      return;
    }

    setFileName(file.name);
    const mime = (file.type || '').toLowerCase();
    const isGeminiAccepted = mime && (GEMINI_ACCEPTED_MIME_TYPES as readonly string[]).includes(mime);

    if (isGeminiAccepted) {
      // Any Gemini-supported type: read as base64 for multimodal API
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        if (!result || result.length < 100) {
          alert('Error: The file appears to be empty or corrupted. Please try a different file.');
          return;
        }
        setFileBase64(result);
        setFileMimeType(mime);
        setFileContent('');
      };
      reader.onerror = () => {
        alert('Error reading file. The file may be corrupted or in an unsupported format. Please try again.');
        setFileName('');
        setFileBase64('');
      };
      reader.readAsDataURL(file);
    } else {
      // Fallback: try reading as text (e.g. .md or other text files)
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target?.result as string;
        const cleanText = text.replace(/\x00/g, '');
        setFileContent(cleanText);
        setFileBase64('');
        setFileMimeType(file.type || 'text/plain');
      };
      reader.onerror = () => {
        alert('Error reading file. Please ensure it is a valid text file or a supported format (e.g. PDF, images).');
      };
      reader.readAsText(file, 'UTF-8');
    }
  };

  const handleOtherDocsFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      alert(`File size (${Math.round(file.size / 1024 / 1024)}MB) exceeds the maximum allowed size of 20MB.`);
      return;
    }
    if (file.size === 0) {
      alert('The selected file is empty. Please select a valid file.');
      return;
    }
    setOtherDocsFileName(file.name);
    const mime = (file.type || '').toLowerCase();
    const isGeminiAccepted = mime && (GEMINI_ACCEPTED_MIME_TYPES as readonly string[]).includes(mime);
    if (isGeminiAccepted && !['text/plain', 'text/csv', 'application/json'].includes(mime)) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const result = ev.target?.result as string;
        if (result && result.length >= 100) {
          setOtherDocsFileBase64(result);
          setOtherDocsFileMimeType(mime);
          setOtherDocsFileContent('');
        }
      };
      reader.onerror = () => {
        setOtherDocsFileName('');
        setOtherDocsFileBase64('');
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = (ev.target?.result as string)?.replace(/\x00/g, '') || '';
        setOtherDocsFileContent(text);
        setOtherDocsFileBase64('');
        setOtherDocsFileMimeType('');
      };
      reader.onerror = () => setOtherDocsFileName('');
      reader.readAsText(file, 'UTF-8');
    }
    e.target.value = '';
  };

  const clearOtherDocsFile = () => {
    setOtherDocsFileName('');
    setOtherDocsFileContent('');
    setOtherDocsFileBase64('');
    setOtherDocsFileMimeType('');
  };

  const handleCancelGenerate = () => {
    cancelledRef.current = true;
    setLoading(false);
    setLoadingStage('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceMode === null) return;
    if (sourceMode === 'linkedin') {
      if (!linkedinText.trim()) {
        alert('Please paste the LinkedIn profile text.');
        return;
      }
    } else {
      if (!fileContent && !fileBase64) {
        alert('Please select a file to upload.');
        return;
      }
    }
    cancelledRef.current = false;
    setLoading(true);
    try {
      let extractedText = fileContent;

      if (sourceMode === 'linkedin') {
        setLoadingStage('Analyzing professional facts...');
        const extractedFacts = await geminiService.extractFacts(linkedinText);
        if (cancelledRef.current) return;
        let otherDocsResolved = '';
        if (otherDocsFileName) {
          if (otherDocsFileBase64 && otherDocsFileMimeType) {
            setLoadingStage('Extracting text from other docs...');
            const extractPrompt = `Extract the key text content from this document (CV, portfolio, or similar). Focus on: professional background, roles, achievements, skills, and any other career-related content. Return plain text, concise but comprehensive (max ~8000 words).`;
            let base64Data = otherDocsFileBase64.startsWith('data:') ? otherDocsFileBase64.split(',')[1] : otherDocsFileBase64;
            if (base64Data && base64Data.length >= 100) {
              otherDocsResolved = await geminiService.runSimulation(extractPrompt, otherDocsFileBase64, otherDocsFileMimeType);
              if (otherDocsResolved.length > 30000) otherDocsResolved = otherDocsResolved.substring(0, 30000) + '\n\n[Content truncated]';
            }
          } else {
            otherDocsResolved = otherDocsFileContent;
          }
        }
        if (cancelledRef.current) return;
        const combined = otherDocsResolved.trim()
          ? `${extractedFacts}\n\n--- Additional context (CV/portfolio) ---\n${otherDocsResolved.trim()}`
          : extractedFacts;
        setLoadingStage('Discovering identity...');
        const idPrompt = `Identify the specific professional from these facts. Return JSON: { "name": string, "title": string, "summary": string }. Facts: ${extractedFacts.substring(0, 2000)}`;
        const identity = await geminiService.generateBasic(idPrompt, true);
        if (cancelledRef.current) return;
        const rawName = (identity as { name?: string })?.name;
        const rawTitle = (identity as { title?: string })?.title;
        const rawSummary = (identity as { summary?: string })?.summary;
        const name = (typeof rawName === 'string' && rawName.trim()) ? rawName.trim() : await geminiService.generatePersonaName('professional advisor');
        const title = (typeof rawTitle === 'string' && rawTitle.trim()) ? rawTitle.trim() : 'Advisor';
        const summary = (typeof rawSummary === 'string' && rawSummary.trim()) ? rawSummary.trim() : undefined;
        setLoadingStage(`Building High-Fidelity Blueprint for ${name}...`);
        const limitedMaterial = combined.length > 30000
          ? combined.substring(0, 30000) + '\n\n[Earlier content truncated for context management]'
          : combined;
        const profileOutput = await geminiService.generateChain(highFidelityPersonaTemplate, {
          "Fact Extraction (Source of Truth)": extractedFacts,
          "Raw LinkedIn Content": linkedinText,
          "Other Docs": otherDocsResolved,
          "Primary Source Material": limitedMaterial,
          "Identity Target": `${name} - ${title}`,
          "Context Summary": summary || title,
          "Target Name": name,
        }, true);
        if (cancelledRef.current) return;
        setLoadingStage(`Generating Digital Likeness for ${name || 'advisor'}...`);
        const avatarUrl = await geminiService.generateAvatar(name, title);
        if (cancelledRef.current) return;
        const persona = await personaApi.create({
          name: name,
          type: 'advisor',
          description: (summary || title) || "High-fidelity specialized advisor.",
          avatarUrl: avatarUrl,
          metadata: { personaGroupId: "N/A" },
        });
        await personaApi.createFile(persona.id, {
          name: `1_Expert_Blueprint.md`,
          content: profileOutput,
          type: 'markdown'
        });
        const storedContent = combined.length > 50000
          ? combined.substring(0, 50000) + '\n\n[Content truncated for storage]'
          : combined;
        try {
          await personaApi.createFile(persona.id, {
            name: `Knowledge_Source.md`,
            content: storedContent,
            type: 'pdf_analysis'
          });
        } catch (fileErr) {
          console.warn('Knowledge source file failed to save for advisor persona:', fileErr);
        }
        setCreatedPersonaIds([persona.id]);
        return;
      }

      if (fileBase64 && fileMimeType) {
        setLoadingStage('Extracting text from document...');
        const extractPrompt = `Extract the key text content from this document. Focus on:
1. Author/expert name and credentials
2. Main concepts, theories, and key insights
3. Important quotes or passages
4. Summary of the content (limit to ~8000 words maximum)

Return the extracted text in a structured format. Be concise but comprehensive.`;

        let base64Data: string;
        if (fileBase64.startsWith('data:')) {
          const commaIndex = fileBase64.indexOf(',');
          if (commaIndex === -1) {
            throw new Error('Invalid file data format. Please try uploading the file again.');
          }
          base64Data = fileBase64.substring(commaIndex + 1);
        } else {
          base64Data = fileBase64;
        }

        if (!base64Data || base64Data.length < 100) {
          throw new Error('File appears to be empty or corrupted. Please ensure the file is valid and contains readable content.');
        }

        extractedText = await geminiService.runSimulation(
          extractPrompt,
          fileBase64,
          fileMimeType
        );
        if (cancelledRef.current) return;

        if (extractedText.length > 50000) {
          extractedText = extractedText.substring(0, 50000) + '\n\n[Content truncated to manage context size]';
        }
      }

      if (!extractedText || extractedText.trim().length === 0) {
        throw new Error('Failed to extract text from the file. Please ensure the document contains readable content.');
      }
      
      setLoadingStage('Identifying Author Identity...');
      const idPrompt = `Analyze this text and identify the primary author/expert. Return JSON: { "name": string, "title": string, "summary": string }. 
Limit your analysis to the key identifying information. Text sample: ${extractedText.substring(0, 8000)}`;
      const identity = await geminiService.generateBasic(idPrompt, true);
      if (cancelledRef.current) return;
      const rawName = (identity as { name?: string })?.name;
      const rawTitle = (identity as { title?: string })?.title;
      const rawSummary = (identity as { summary?: string })?.summary;
      const name = (typeof rawName === 'string' && rawName.trim()) ? rawName.trim() : await geminiService.generatePersonaName('professional advisor');
      const title = (typeof rawTitle === 'string' && rawTitle.trim()) ? rawTitle.trim() : 'Advisor';
      const summary = (typeof rawSummary === 'string' && rawSummary.trim()) ? rawSummary.trim() : undefined;

      setLoadingStage(`Building High-Fidelity Blueprint for ${name}...`);
      const limitedSourceMaterial = extractedText.length > 30000 
        ? extractedText.substring(0, 30000) + '\n\n[Earlier content truncated for context management]'
        : extractedText;
        
      const profileOutput = await geminiService.generateChain(highFidelityPersonaTemplate, { 
        "Primary Source Material": limitedSourceMaterial,
        "Identity Target": `${name} - ${title}`,
        "Context Summary": summary
      }, true);
      if (cancelledRef.current) return;
      
      setLoadingStage(`Generating Digital Likeness for ${name}...`);
      const avatarUrl = await geminiService.generateAvatar(name, title);
      if (cancelledRef.current) return;

      const persona = await personaApi.create({
        name: name,
        type: 'advisor',
        description: summary || "High-fidelity specialized advisor.",
        avatarUrl: avatarUrl,
        metadata: { personaGroupId: "N/A" },
      });

      await personaApi.createFile(persona.id, {
        name: `1_Expert_Blueprint.md`,
        content: profileOutput,
        type: 'markdown'
      });
      const storedContent = extractedText.length > 50000 
        ? extractedText.substring(0, 50000) + '\n\n[Content truncated for storage]'
        : extractedText;
        
      try {
        await personaApi.createFile(persona.id, {
          name: `Knowledge_Source.md`,
          content: storedContent,
          type: 'pdf_analysis'
        });
      } catch (fileErr) {
        console.warn('Knowledge source file failed to save for advisor persona:', fileErr);
      }
      setCreatedPersonaIds([persona.id]);
    } catch (err: any) {
      if (!cancelledRef.current) {
        console.error('Advisor generation error:', err);
        const errorMessage = err?.message || err?.toString() || 'Unknown error occurred';
        alert(`Analysis failed: ${errorMessage}`);
      }
    } finally {
      if (!cancelledRef.current) setLoading(false);
      setLoadingStage('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      {createdPersonaIds && createdPersonaIds.length > 0 ? (
        <div className="space-y-8">
          <h3 className="text-xl font-bold text-gray-900">Set visibility</h3>
          <p className="text-gray-500">Choose who can discover and use this persona.</p>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="advisor-visibility"
                checked={visibilityChoice === 'public'}
                onChange={() => setVisibilityChoice('public')}
                className="border-gray-300 text-violet-600"
              />
              <span className="font-medium">Public</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="advisor-visibility"
                checked={visibilityChoice === 'private'}
                onChange={() => setVisibilityChoice('private')}
                className="border-gray-300 text-violet-600"
              />
              <span className="font-medium">Private</span>
            </label>
          </div>
          <p className="text-sm text-gray-400">
            {visibilityChoice === 'public' ? 'Everyone can discover and use this persona in My Personas.' : 'Only you can see and use this persona.'}
          </p>
          <button
            type="button"
            disabled={savingVisibility}
            onClick={async () => {
              setSavingVisibility(true);
              try {
                const results = await Promise.allSettled(
                  createdPersonaIds.map((id) => personaApi.update(id, { visibility: visibilityChoice }))
                );
                const failed = results.filter((r) => r.status === 'rejected').length;
                if (failed > 0) {
                  throw new Error(`${failed} persona${failed > 1 ? 's' : ''} failed to save visibility`);
                }
                onComplete();
              } catch (err: any) {
                alert(err?.message || 'Failed to save visibility');
              } finally {
                setSavingVisibility(false);
              }
            }}
            className="w-full py-6 bg-violet-600 text-white font-black text-lg rounded-3xl shadow-xl hover:bg-violet-700 disabled:opacity-50 transition-all"
          >
            {savingVisibility ? <Loader2 className="animate-spin mx-auto" /> : 'Save and go to My Personas'}
          </button>
        </div>
      ) : loading ? (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="text-center space-y-2">
            <h3 className="text-2xl font-bold text-gray-900">Building Your Advisor</h3>
            <p className="text-gray-500 font-medium">Our AI agents are analyzing source material and crafting your advisor profile.</p>
          </div>

          <BuildPipelineIndicator loadingStage={loadingStage} isAdvisor />

          <div className="flex items-center justify-center gap-3 bg-violet-50/60 border border-violet-100 rounded-2xl px-5 py-4">
            <Loader2 className="w-5 h-5 text-violet-500 animate-spin flex-shrink-0" />
            <span className="text-sm font-semibold text-violet-700">{loadingStage}</span>
          </div>

          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleCancelGenerate}
              className="flex items-center justify-center gap-2 px-8 py-3 border-2 border-red-200 text-red-600 rounded-2xl font-bold hover:bg-red-50 transition-all"
            >
              <X className="w-5 h-5" />
              Cancel Generation
            </button>
          </div>
        </div>
      ) : (
      <>
      {sourceMode == null ? (
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-gray-900">How do you want to create your advisor?</h3>
          <p className="text-gray-500">Pick one method. Each run uses only that input.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setSourceMode('linkedin')}
              className="group bg-white border-2 border-gray-100 hover:border-violet-400 p-6 rounded-2xl text-left transition-all hover:shadow-lg"
            >
              <Linkedin className="w-10 h-10 text-violet-500 mb-3" />
              <h4 className="font-bold text-gray-900 mb-1">LinkedIn (paste profile text)</h4>
              <p className="text-sm text-gray-500">Paste LinkedIn profile or resume text to build a high-fidelity advisor from professional context.</p>
            </button>
            <button
              type="button"
              onClick={() => setSourceMode('pdf')}
              className="group bg-white border-2 border-gray-100 hover:border-indigo-400 p-6 rounded-2xl text-left transition-all hover:shadow-lg"
            >
              <FileUp className="w-10 h-10 text-indigo-500 mb-3" />
              <h4 className="font-bold text-gray-900 mb-1">Upload PDF / document</h4>
              <p className="text-sm text-gray-500">Upload a PDF or document (book, article, strategy doc); content is analyzed to create the advisor blueprint.</p>
            </button>
          </div>
        </div>
      ) : (
      <div className="space-y-8">
        <div className="flex items-center gap-4">
          <button type="button" onClick={() => setSourceMode(null)} className="text-sm font-bold text-gray-400 hover:text-violet-600 uppercase tracking-widest">
            ← Change method
          </button>
        </div>

      {sourceMode === 'linkedin' && (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 flex gap-4">
            <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
            <div>
              <h4 className="font-bold text-amber-900 mb-1">Important</h4>
              <p className="text-sm text-amber-800 leading-relaxed">
                Do not paste a URL. Go to the LinkedIn profile, select all text (Ctrl+A), copy (Ctrl+C), and paste below.
              </p>
            </div>
          </div>
          <FormItem
            label="LinkedIn profile (paste content)"
            value={linkedinText}
            onChange={setLinkedinText}
            textarea
            placeholder="Select all text on the LinkedIn page and paste here..."
          />
          <div className="space-y-4">
            <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Other docs (CV, portfolio, optional)</label>
            <p className="text-sm text-gray-500">Upload a CV, portfolio, or other document to add to the advisor context.</p>
            {otherDocsFileName ? (
              <div className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-100 rounded-2xl">
                <FileText className="w-5 h-5 text-gray-500 shrink-0" />
                <span className="text-sm font-medium text-gray-900 truncate flex-1">{otherDocsFileName}</span>
                <button
                  type="button"
                  onClick={clearOtherDocsFile}
                  className="shrink-0 px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-red-600 border border-gray-200 rounded-xl hover:bg-gray-100"
                >
                  Remove
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-100 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:border-indigo-200 transition-all bg-gray-50/50">
                <Upload className="w-10 h-10 text-gray-300 mb-2" />
                <p className="text-sm font-medium text-gray-600 mb-3">PDF, Word, images, or text files</p>
                <input
                  type="file"
                  id="other-docs-file"
                  className="hidden"
                  accept={GEMINI_FILE_INPUT_ACCEPT}
                  onChange={handleOtherDocsFile}
                />
                <label htmlFor="other-docs-file" className="cursor-pointer px-6 py-2.5 bg-indigo-50 text-indigo-700 font-bold rounded-xl hover:bg-indigo-100 text-sm">
                  Select file
                </label>
              </div>
            )}
          </div>
        </>
      )}

      {sourceMode === 'pdf' && (
        <div className="space-y-4">
          <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Upload Expert Source</label>
          <div className="border-4 border-dashed border-gray-100 rounded-[2rem] p-16 flex flex-col items-center justify-center text-center hover:border-violet-300 transition-all bg-gray-50/50 group">
            <Upload className="w-16 h-16 text-gray-300 mb-6 group-hover:text-violet-500" />
            <p className="text-xl font-bold text-gray-600 mb-6">PDF or document (book, article, or other supported file)</p>
            <input type="file" id="advisor-file" className="hidden" accept={GEMINI_FILE_INPUT_ACCEPT} onChange={handleFile} />
            <label htmlFor="advisor-file" className="cursor-pointer px-10 py-4 bg-violet-600 text-white font-bold rounded-2xl shadow-lg">
              {fileName || 'Select Document'}
            </label>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={sourceMode === null || (sourceMode === 'linkedin' ? !linkedinText.trim() : !fileContent && !fileBase64)}
          className="flex-1 min-w-[200px] py-6 bg-violet-600 text-white font-black text-lg rounded-3xl shadow-xl hover:bg-violet-700 disabled:opacity-50 transition-all"
        >
          Submit for Advisor Profiling
        </button>
      </div>
      </div>
      )}
      </>
      )}
    </form>
  );
};

// --- MAIN PAGE ---
type BuildMode = 'synthetic_user' | 'advisor';

const BuildPersonaPage: React.FC = () => {
  const [selectedBuildMode, setSelectedBuildMode] = useState<BuildMode | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultPublic = searchParams.get('visibility') === 'public';

  // When arriving via /build?type=advisor or /build?type=synthetic_user, open that form directly
  useEffect(() => {
    const type = searchParams.get('type');
    if (type === 'advisor' || type === 'synthetic_user') {
      setSelectedBuildMode(type);
    }
  }, [searchParams]);

  const handleBack = () => {
    if (selectedBuildMode) setSelectedBuildMode(null);
    else navigate(-1);
  };

  if (!selectedBuildMode) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 w-full">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">Intelligence Blueprints</h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto font-medium">Select a specialized generation engine to build your synthetic workforce.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <TypeCard
            title="Synthetic User"
            description="Generate personas from problem/solution, supporting docs, or your saved business background. Choose one method per run."
            icon={Target}
            onClick={() => setSelectedBuildMode('synthetic_user')}
            theme="indigo"
          />
          <TypeCard
            title="Advisor"
            description="Create advisors from LinkedIn profile text or PDF/document upload. Deep analysis with Red Team critical evaluation."
            icon={Sparkles}
            onClick={() => setSelectedBuildMode('advisor')}
            theme="violet"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 w-full">
      <button
        onClick={handleBack}
        className="flex items-center text-sm font-bold text-gray-400 hover:text-indigo-600 mb-8 transition-colors uppercase tracking-widest"
      >
        <ArrowLeft className="w-4 h-4 mr-2" /> Back to Selection
      </button>

      <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-gray-200/50 border border-gray-100 overflow-hidden animate-in fade-in slide-in-from-bottom-6 duration-500">
        <div className="p-8 sm:p-14">
          {selectedBuildMode === 'synthetic_user' && <SyntheticUserForm onComplete={() => navigate('/gallery')} defaultVisibility={defaultPublic ? 'public' : 'private'} />}
          {selectedBuildMode === 'advisor' && <AdvisorForm onComplete={() => navigate('/gallery')} defaultVisibility={defaultPublic ? 'public' : 'private'} />}
        </div>
      </div>
    </div>
  );
};

export default BuildPersonaPage;
