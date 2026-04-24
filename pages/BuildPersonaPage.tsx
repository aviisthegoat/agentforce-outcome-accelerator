
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Target, Sparkles, ArrowLeft, Loader2, Upload, ChevronRight, AlertCircle } from 'lucide-react';
import { storageService } from '../services/storage';
import { geminiService } from '../services/gemini';
import { PersonaType, Persona } from '../types';

// Import split templates
import { marketCanvasTemplate } from '../templates/marketCanvasTemplate';
import { jobBuilderTemplate } from '../templates/jobBuilderTemplate';
import { metricsTemplate } from '../templates/metricsTemplate';
import { agentProfileDetailedTemplate } from '../templates/agentProfileDetailedTemplate';
import { agentBehaviorsTemplate } from '../templates/agentBehaviorsTemplate';
import { highFidelityPersonaTemplate } from '../templates/highFidelityPersonaTemplate';

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

// --- SYNTHETIC USER FORM ---
const SyntheticUserForm: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [q6FileName, setQ6FileName] = useState('');
  const [formData, setFormData] = useState({
    q1: '', q2: '', q3: '', q4: '', q5: 'B2B' as 'B2B' | 'B2C', q6: '', q7: 1
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setQ6FileName(file.name);
      const reader = new FileReader();
      reader.onload = (ev) => {
        setFormData(prev => ({ ...prev, q6: ev.target?.result as string }));
      };
      reader.readAsText(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const personaGroupId = crypto.randomUUID();
      const userQInputs = `Problem: ${formData.q1}\nSolution: ${formData.q2}\nDiff: ${formData.q3}\nExisting: ${formData.q4}\nContext: ${formData.q5}\nBusiness Data Source (${q6FileName}): ${formData.q6}`;

      setLoadingStage('Synthesizing Market Canvas...');
      const marketCanvas = await geminiService.generateChain(marketCanvasTemplate, { "Strategic Input": userQInputs });

      setLoadingStage('Designing Job Architecture...');
      const jobBuilder = await geminiService.generateChain(jobBuilderTemplate, { "Strategic Analysis": marketCanvas });

      setLoadingStage('Quantifying Success Metrics...');
      const metrics = await geminiService.generateChain(metricsTemplate, { "Context": marketCanvas, "Jobs": jobBuilder });

      const idPrompt = `Identify ${formData.q7} distinct personas from this analysis. For each persona return a real-sounding human name (invented first and last name, e.g. "Sarah Chen", "Marcus Webb") in "name" and their job/role title (e.g. "Project Lead", "Marketing Director") in "title". Do not put job titles in the "name" field—only plausible person names. CRITICAL: Each persona must have a unique full name—no two personas in the list may share the same name. Return JSON: { "personas": [{ "name": string, "title": string }] }. Analysis: ${marketCanvas}`;
      const raw = await geminiService.generateBasic(idPrompt, true);
      const personasRaw = Array.isArray(raw?.personas) ? raw.personas : [];
      const usedNames = new Set<string>();
      const personas: { name: string; title: string }[] = [];
      for (let index = 0; index < personasRaw.length; index++) {
        const p = personasRaw[index] as { name?: string; title?: string };
        const titleStr = (typeof p?.title === 'string' && p.title.trim()) ? p.title.trim() : 'Autonomous Agent';
        let nameStr = (typeof p?.name === 'string' && p.name.trim()) ? p.name.trim() : '';
        let name = (nameStr && nameStr !== titleStr) ? nameStr : await geminiService.generatePersonaName(titleStr, Array.from(usedNames));
        if (!name || name === 'Persona') name = titleStr;
        while (usedNames.has(name)) {
          name = await geminiService.generatePersonaName(`${titleStr} (alternative)`, Array.from(usedNames));
          if (!name || name === 'Persona') name = `${titleStr} ${usedNames.size + 1}`;
        }
        usedNames.add(name);
        personas.push({ name, title: titleStr });
      }

      for (const pInfo of personas) {
        setLoadingStage(`Profiling Agent: ${pInfo.name}...`);
        const profile = await geminiService.generateChain(agentProfileDetailedTemplate, { 
          "Target Persona Name": pInfo.name, 
          "Reference Analysis": `${marketCanvas}\n${jobBuilder}\n${metrics}` 
        });

        setLoadingStage(`Defining Behaviors: ${pInfo.name}...`);
        const behaviors = await geminiService.generateChain(agentBehaviorsTemplate, { 
          "Target Persona": pInfo.name, 
          "Detailed Profile": profile 
        });

        setLoadingStage(`Capturing Digital Likeness: ${pInfo.name}...`);
        const avatarUrl = await geminiService.generateAvatar(pInfo.name, pInfo.title);

        const persona: Persona = {
          id: crypto.randomUUID(),
          name: pInfo.name,
          type: 'synthetic_user',
          description: pInfo.title,
          avatarUrl: avatarUrl,
          createdAt: new Date().toISOString(),
          metadata: { personaGroupId },
          files: [
            { id: crypto.randomUUID(), name: `Job_Builder.md`, content: jobBuilder, type: 'markdown' },
            { id: crypto.randomUUID(), name: `Metrics.md`, content: metrics, type: 'markdown' },
            { id: crypto.randomUUID(), name: `10Point_Agent_Profile.md`, content: profile, type: 'markdown' },
            { id: crypto.randomUUID(), name: `Agent_Behaviors.md`, content: behaviors, type: 'markdown' }
          ]
        };
        await storageService.savePersona(persona);
      }
      onComplete();
    } catch (err) {
      console.error(err);
      alert('Generation failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      <div className="space-y-8">
        <FormItem label="UserQ1: Problem" value={formData.q1} onChange={v => setFormData({...formData, q1: v})} textarea placeholder="Problem..." />
        <FormItem label="UserQ2: Solution" value={formData.q2} onChange={v => setFormData({...formData, q2: v})} textarea placeholder="Solution..." />
        <FormItem label="UserQ3: Diff" value={formData.q3} onChange={v => setFormData({...formData, q3: v})} textarea placeholder="Differentiation..." />
        <FormItem label="UserQ4: Alternatives" value={formData.q4} onChange={v => setFormData({...formData, q4: v})} textarea placeholder="Existing..." />
        
        <div className="space-y-4">
          <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">UserQ6: Supporting Docs (Business Plan, Market Research, etc.)</label>
          <div className="border-4 border-dashed border-gray-100 rounded-[2rem] p-12 flex flex-col items-center justify-center text-center hover:border-indigo-300 transition-all bg-gray-50/50 group">
            <Upload className="w-12 h-12 text-gray-300 mb-4 group-hover:text-indigo-500" />
            <p className="text-lg font-bold text-gray-600 mb-4">Include docs about your business</p>
            <input type="file" id="user-q6-file" className="hidden" onChange={handleFile} />
            <label htmlFor="user-q6-file" className="cursor-pointer px-8 py-3 bg-indigo-600 text-white font-bold rounded-2xl shadow-lg hover:bg-indigo-700 transition-colors">
              {q6FileName || 'Select Document'}
            </label>
          </div>
        </div>

        <div className="space-y-4">
          <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">UserQ7: Generation Count</label>
          <select value={formData.q7} onChange={e => setFormData({...formData, q7: parseInt(e.target.value)})} className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-5 font-bold">
            {[1,2,3,4,5].map(n => <option key={n} value={n}>{n} Agent{n > 1 ? 's' : ''}</option>)}
          </select>
        </div>
      </div>
      <button type="submit" disabled={loading} className="w-full py-6 bg-indigo-600 text-white font-black text-lg rounded-3xl shadow-xl hover:bg-indigo-700 disabled:opacity-50 transition-all">
        {loading ? <div className="flex flex-col items-center"><Loader2 className="animate-spin mb-1" /> <span className="text-xs uppercase tracking-widest">{loadingStage}</span></div> : 'Submit Blueprint'}
      </button>
    </form>
  );
};

// --- ADVISOR FORM ---
type AdvisorSourceMode = 'linkedin' | 'pdf';

const AdvisorForm: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [sourceMode, setSourceMode] = useState<AdvisorSourceMode>('pdf');
  const [linkedinText, setLinkedinText] = useState('');
  const [otherDocsText, setOtherDocsText] = useState('');
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState('');

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (ev) => setFileContent(ev.target?.result as string);
      reader.readAsText(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceMode === 'linkedin') {
      if (!linkedinText.trim()) {
        alert('Please paste the LinkedIn profile text.');
        return;
      }
    } else {
      if (!fileContent) return;
    }
    setLoading(true);
    try {
      let extractedText: string;
      if (sourceMode === 'linkedin') {
        setLoadingStage('Analyzing professional facts...');
        const extractedFacts = await geminiService.extractFacts(linkedinText);
        extractedText = otherDocsText.trim()
          ? `${extractedFacts}\n\n--- Additional context ---\n${otherDocsText.trim()}`
          : extractedFacts;
        setLoadingStage('Discovering identity...');
        const idPrompt = `Identify the specific professional from these facts. Return JSON: { "name": string, "title": string, "summary": string }. Facts: ${extractedFacts.substring(0, 2000)}`;
        const identity = await geminiService.generateBasic(idPrompt, true);
        const rawName = (identity as { name?: string })?.name;
        const rawTitle = (identity as { title?: string })?.title;
        const rawSummary = (identity as { summary?: string })?.summary;
        const name = (typeof rawName === 'string' && rawName.trim()) ? rawName.trim() : await geminiService.generatePersonaName('professional advisor');
        const title = (typeof rawTitle === 'string' && rawTitle.trim()) ? rawTitle.trim() : 'Advisor';
        const summary = (typeof rawSummary === 'string' && rawSummary.trim()) ? rawSummary.trim() : undefined;
        setLoadingStage(`Building High-Fidelity Blueprint for ${name}...`);
        const profileOutput = await geminiService.generateChain(highFidelityPersonaTemplate, {
          "Fact Extraction (Source of Truth)": extractedFacts,
          "Raw LinkedIn Content": linkedinText,
          "Other Docs": otherDocsText,
          "Primary Source Material": extractedText.substring(0, 30000),
          "Identity Target": `${name} - ${title}`,
          "Context Summary": summary || title,
          "Target Name": name,
        }, true);
        setLoadingStage(`Generating Digital Likeness for ${name}...`);
        const avatarUrl = await geminiService.generateAvatar(name, title);
        const persona: Persona = {
          id: crypto.randomUUID(),
          name: name,
          type: 'advisor',
          description: (summary || title) || "High-fidelity specialized advisor.",
          avatarUrl: avatarUrl,
          createdAt: new Date().toISOString(),
          metadata: { personaGroupId: "N/A" },
          files: [
            { id: crypto.randomUUID(), name: `1_Expert_Blueprint.md`, content: profileOutput, type: 'markdown' },
            { id: crypto.randomUUID(), name: `Knowledge_Source.md`, content: extractedText.length > 50000 ? extractedText.substring(0, 50000) + '\n\n[Content truncated for storage]' : extractedText, type: 'pdf_analysis' }
          ]
        };
        await storageService.savePersona(persona);
        onComplete();
        return;
      }
      extractedText = fileContent;
      setLoadingStage('Identifying Author Identity...');
      const idPrompt = `Analyze this text and identify the primary author/expert. Return JSON: { "name": string, "title": string, "summary": string }. Text: ${extractedText.substring(0, 5000)}`;
      const identity = await geminiService.generateBasic(idPrompt, true);
      const rawName = (identity as { name?: string })?.name;
      const rawTitle = (identity as { title?: string })?.title;
      const rawSummary = (identity as { summary?: string })?.summary;
      const name = (typeof rawName === 'string' && rawName.trim()) ? rawName.trim() : await geminiService.generatePersonaName('professional advisor');
      const title = (typeof rawTitle === 'string' && rawTitle.trim()) ? rawTitle.trim() : 'Advisor';
      const summary = (typeof rawSummary === 'string' && rawSummary.trim()) ? rawSummary.trim() : undefined;
      setLoadingStage(`Building High-Fidelity Blueprint for ${name}...`);
      const profileOutput = await geminiService.generateChain(highFidelityPersonaTemplate, {
        "Primary Source Material": extractedText,
        "Identity Target": `${name} - ${title}`,
        "Context Summary": summary
      }, true);
      setLoadingStage(`Generating Digital Likeness for ${name}...`);
      const avatarUrl = await geminiService.generateAvatar(name, title);
      const persona: Persona = {
        id: crypto.randomUUID(),
        name: name,
        type: 'advisor',
        description: summary || "High-fidelity specialized advisor.",
        avatarUrl: avatarUrl,
        createdAt: new Date().toISOString(),
        metadata: { personaGroupId: "N/A" },
        files: [
          { id: crypto.randomUUID(), name: `1_Expert_Blueprint.md`, content: profileOutput, type: 'markdown' },
          { id: crypto.randomUUID(), name: `Knowledge_Source.md`, content: extractedText, type: 'pdf_analysis' }
        ]
      };
      await storageService.savePersona(persona);
      onComplete();
    } catch (err) {
      console.error(err);
      alert('Analysis failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-10">
      <div className="space-y-4">
        <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Source</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="advisor-source" checked={sourceMode === 'linkedin'} onChange={() => setSourceMode('linkedin')} className="border-gray-300 text-violet-600" />
            <span className="font-medium">LinkedIn (paste profile text)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="advisor-source" checked={sourceMode === 'pdf'} onChange={() => setSourceMode('pdf')} className="border-gray-300 text-violet-600" />
            <span className="font-medium">Upload PDF / document</span>
          </label>
        </div>
      </div>
      {sourceMode === 'linkedin' && (
        <>
          <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 flex gap-4">
            <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
            <div>
              <h4 className="font-bold text-amber-900 mb-1">Important</h4>
              <p className="text-sm text-amber-800 leading-relaxed">Do not paste a URL. Go to the LinkedIn profile, select all text (Ctrl+A), copy (Ctrl+C), and paste below.</p>
            </div>
          </div>
          <FormItem label="LinkedIn profile (paste content)" value={linkedinText} onChange={setLinkedinText} textarea placeholder="Select all text on the LinkedIn page and paste here..." />
          <FormItem label="Other docs (CV, portfolio, optional)" value={otherDocsText} onChange={setOtherDocsText} textarea placeholder="Paste additional career history or dossier text..." />
        </>
      )}
      {sourceMode === 'pdf' && (
        <div className="space-y-4">
          <label className="block text-sm font-black text-gray-400 uppercase tracking-widest">Upload Expert Source</label>
          <div className="border-4 border-dashed border-gray-100 rounded-[2rem] p-16 flex flex-col items-center justify-center text-center hover:border-violet-300 transition-all bg-gray-50/50 group">
            <Upload className="w-16 h-16 text-gray-300 mb-6 group-hover:text-violet-500" />
            <p className="text-xl font-bold text-gray-600 mb-6">PDF of a book or major article</p>
            <input type="file" id="advisor-file" className="hidden" onChange={handleFile} />
            <label htmlFor="advisor-file" className="cursor-pointer px-10 py-4 bg-violet-600 text-white font-bold rounded-2xl shadow-lg">
              {fileName || 'Select Document'}
            </label>
          </div>
        </div>
      )}
      <button type="submit" disabled={loading || (sourceMode === 'linkedin' ? !linkedinText.trim() : !fileContent)} className="w-full py-6 bg-violet-600 text-white font-black text-lg rounded-3xl shadow-xl hover:bg-violet-700 disabled:opacity-50 transition-all">
        {loading ? <div className="flex flex-col items-center"><Loader2 className="animate-spin mb-1" /> <span className="text-xs uppercase tracking-widest">{loadingStage}</span></div> : 'Submit for Agent Profiling'}
      </button>
    </form>
  );
};

// --- MAIN PAGE ---

const BuildPersonaPage: React.FC = () => {
  const [selectedType, setSelectedType] = useState<PersonaType | null>(null);
  const navigate = useNavigate();

  const handleBack = () => {
    if (selectedType) setSelectedType(null);
    else navigate(-1);
  };

  if (!selectedType) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 w-full">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">Intelligence Blueprints</h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto font-medium">Select a specialized generation engine to build your synthetic workforce.</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <TypeCard
            title="Autonomous Agent"
            description="Multi-layered agent configuration for market research and product stress-testing."
            icon={Target}
            onClick={() => setSelectedType('synthetic_user')}
            theme="indigo"
          />
          <TypeCard
            title="Advisor Agent"
            description="Configure agents from LinkedIn profile text or PDF/document upload. Deep analysis with Red Team critical evaluation."
            icon={Sparkles}
            onClick={() => setSelectedType('advisor')}
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
          {selectedType === 'synthetic_user' && <SyntheticUserForm onComplete={() => navigate('/gallery')} />}
          {selectedType === 'advisor' && <AdvisorForm onComplete={() => navigate('/gallery')} />}
        </div>
      </div>
    </div>
  );
};

export default BuildPersonaPage;
