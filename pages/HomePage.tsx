
import React from 'react';
import { Link } from 'react-router-dom';
import { 
  UserPlus, 
  MessageSquare, 
  Sparkles, 
  Target, 
  Zap, 
  Plus, 
  TrendingUp, 
  Heart, 
  ShieldCheck, 
  ExternalLink,
  Quote
} from 'lucide-react';

const HomePage: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Hero Section */}
      <div className="text-center mb-16">
        <h1 className="text-4xl font-black text-gray-900 sm:text-5xl md:text-7xl leading-tight tracking-tight">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-violet-600 to-pink-600">
            Emotionally Intelligent
          </span><br />
          Agentforce Agents
        </h1>
        <p className="mt-6 max-w-2xl mx-auto text-lg text-gray-600 font-medium leading-relaxed">
          Simulate true human decision-making with need-based logic. <br className="hidden md:block" />
          Stress-test your world with high-fidelity cognitive frameworks.
        </p>
        
        <div className="mt-10 flex flex-col sm:flex-row justify-center gap-4">
          <Link
            to="/build"
            className="inline-flex items-center px-10 py-5 border border-transparent text-lg font-black rounded-2xl text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-2xl shadow-indigo-200 hover:-translate-y-1 active:scale-95"
          >
            <Plus className="mr-2 w-6 h-6" />
            Configure your first agent
          </Link>
        </div>
      </div>

      {/* Statistics Section */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
        <StatCard 
          icon={Heart} 
          value="94%" 
          label="Correlation" 
          description="Accuracy in mirroring real-world emotional decision triggers versus raw demographic data."
          color="pink"
        />
        <StatCard 
          icon={TrendingUp} 
          value="3.2x" 
          label="Fidelity" 
          description="Increase in predicting non-rational consumer behavior compared to LLM-standard profiles."
          color="indigo"
        />
        <StatCard 
          icon={ShieldCheck} 
          value="88%" 
          label="Reliability" 
          description="Consistency in simulating high-stakes negotiation anxiety and defensive cognitive biases."
          color="violet"
        />
      </div>

      {/* Feature Grid */}
      <div className="mb-20">
        <div className="flex items-center gap-4 mb-8">
          <div className="h-px bg-gray-200 flex-grow"></div>
          <h2 className="text-xs font-black text-gray-400 uppercase tracking-[0.3em]">Specialized Intelligence Engines</h2>
          <div className="h-px bg-gray-200 flex-grow"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <FeatureCard
            title="Synthetic User"
            description="Built on 'Jobs-to-be-Done' and psychographic tension points. Experience the 'why' behind the click."
            icon={Target}
            link="/info/synthetic-user"
            color="indigo"
          />
          <FeatureCard
            title="Advisor"
            description="Create advisors from LinkedIn profile text or PDF upload. Transmute books and data into an entity that understands the intent of the source."
            icon={Sparkles}
            link="/info/advisor"
            color="violet"
          />
        </div>
      </div>

      {/* Case Studies Section */}
      <div className="mb-20">
        <div className="flex flex-col md:flex-row justify-between items-end mb-10 gap-4">
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight">Case Studies</h2>
            <p className="text-gray-500 font-medium">Real results from emotionally intelligent simulations.</p>
          </div>
          <Link to="/info/methodology" className="flex items-center gap-2 text-indigo-600 font-bold hover:underline">
            Learn more about our framework <ExternalLink className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <CaseStudyCard 
            title="The Retail Friction Pivot"
            client="Fortune 500 Retailer"
            impact="20% churn reduction"
            summary="By simulating 'frustration' markers in high-speed checkout, we identified the specific psychological moment users felt 'abandoned' by digital automation."
            color="indigo"
          />
          <CaseStudyCard 
            title="The Pricing Empathy Map"
            client="SaaS Enterprise"
            impact="15% ARPU Increase"
            summary="Need-based logic revealed that users felt 'undervalued' by tiered pricing, despite the technical value. We recalibrated based on their perceived professional status."
            color="violet"
          />
          <CaseStudyCard 
            title="Crisis Comms Red-Teaming"
            client="Public Relations Firm"
            impact="Zero PR Fallout"
            summary="Modeling 'public anxiety' and 'distrust' personas allowed this firm to refine a response strategy that addressed emotional triggers before they went viral."
            color="pink"
          />
        </div>
      </div>

      {/* Multi-Persona Section */}
      <div className="bg-gray-900 rounded-[3rem] p-10 md:p-16 border border-gray-800 shadow-2xl flex flex-col md:flex-row items-center gap-12 overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl -mr-48 -mt-48"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-pink-600/10 rounded-full blur-3xl -ml-48 -mb-48"></div>
        
        <div className="md:w-1/2 relative z-10">
          <div className="inline-flex items-center px-4 py-2 rounded-full bg-indigo-500/10 text-indigo-400 text-xs font-black uppercase tracking-widest mb-6 border border-indigo-500/20">
            <Zap className="w-4 h-4 mr-2" />
            Synchronous Intelligence
          </div>
          <h2 className="text-4xl font-black text-white mb-6 leading-tight">
            Convene a Panel of <br />
            Need-Based Experts.
          </h2>
          <p className="text-gray-400 text-lg mb-8 leading-relaxed font-medium">
            Assemble up to 5 agents to interact simultaneously. Witness how different emotional frameworks collide, negotiate, and collaborate to reach a decision.
          </p>
          <Link
            to="/chat"
            className="inline-flex items-center px-8 py-4 border border-transparent text-base font-black rounded-2xl text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-900"
          >
            Start Panel Session
            <MessageSquare className="ml-2 w-5 h-5" />
          </Link>
        </div>
        
        <div className="md:w-1/2 relative flex items-center justify-center">
           <div className="relative w-full max-w-sm">
             <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-indigo-500/20 rounded-full blur-2xl animate-pulse"></div>
             <div className="relative bg-gray-800 border border-gray-700 rounded-3xl p-8 shadow-2xl">
               <div className="space-y-6">
                 <div className="flex items-center gap-4">
                   <div className="w-12 h-12 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
                     <Quote className="w-6 h-6 text-indigo-400" />
                   </div>
                   <div className="space-y-2 flex-grow">
                     <div className="h-2 w-32 bg-gray-700 rounded-full"></div>
                     <div className="h-2 w-20 bg-gray-600 rounded-full"></div>
                   </div>
                 </div>
                 <div className="space-y-3">
                   <div className="h-3 w-full bg-gray-700 rounded-lg opacity-50"></div>
                   <div className="h-3 w-full bg-gray-700 rounded-lg opacity-30"></div>
                   <div className="h-3 w-4/5 bg-gray-700 rounded-lg opacity-10"></div>
                 </div>
                 <div className="flex justify-end">
                    <div className="px-4 py-2 bg-indigo-600 rounded-xl text-[10px] font-black text-white uppercase tracking-widest">Processing Logic...</div>
                 </div>
               </div>
             </div>
           </div>
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ icon: any; value: string; label: string; description: string; color: string }> = ({ icon: Icon, value, label, description, color }) => {
  const colorMap: Record<string, string> = {
    indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    violet: 'text-violet-600 bg-violet-50 border-violet-100',
    pink: 'text-pink-600 bg-pink-50 border-pink-100',
  };

  return (
    <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 shadow-sm flex flex-col items-center text-center group hover:shadow-xl transition-all hover:-translate-y-1">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 border ${colorMap[color]}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div className="text-4xl font-black text-gray-900 mb-1">{value}</div>
      <div className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4">{label}</div>
      <p className="text-sm text-gray-500 font-medium leading-relaxed">{description}</p>
    </div>
  );
};

const CaseStudyCard: React.FC<{ title: string; client: string; impact: string; summary: string; color: string }> = ({ title, client, impact, summary, color }) => {
  const colors: Record<string, string> = {
    indigo: 'border-indigo-100 bg-indigo-50/30 text-indigo-600',
    violet: 'border-violet-100 bg-violet-50/30 text-violet-600',
    pink: 'border-pink-100 bg-pink-50/30 text-pink-600',
  };

  return (
    <div className="bg-white p-8 rounded-3xl border border-gray-100 shadow-sm flex flex-col h-full group hover:shadow-md transition-all">
      <div className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-6 border ${colors[color]}`}>
        {impact}
      </div>
      <h3 className="text-lg font-black text-gray-900 mb-2 leading-tight">{title}</h3>
      <p className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider">{client}</p>
      <p className="text-sm text-gray-600 font-medium leading-relaxed mb-6 flex-grow">{summary}</p>
      <button className="text-xs font-black text-gray-900 flex items-center gap-2 group-hover:text-indigo-600 transition-colors uppercase tracking-widest">
        Read Full Case <Plus className="w-3 h-3" />
      </button>
    </div>
  );
};

const FeatureCard: React.FC<{
  title: string;
  description: string;
  icon: any;
  link: string;
  color: string;
}> = ({ title, description, icon: Icon, link, color }) => {
  const colorClasses: any = {
    indigo: 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white shadow-indigo-100',
    violet: 'bg-violet-50 text-violet-600 group-hover:bg-violet-600 group-hover:text-white shadow-violet-100',
    pink: 'bg-pink-50 text-pink-600 group-hover:bg-pink-600 group-hover:text-white shadow-pink-100',
  };

  return (
    <Link to={link} className="group block bg-white border border-gray-100 p-8 rounded-[2.5rem] transition-all hover:shadow-2xl hover:-translate-y-2 h-full">
      <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-8 transition-all shadow-lg ${colorClasses[color]}`}>
        <Icon className="w-8 h-8" />
      </div>
      <h3 className="text-2xl font-black text-gray-900 mb-4 tracking-tight">{title}</h3>
      <p className="text-gray-500 leading-relaxed mb-8 font-medium">{description}</p>
      <div className="flex items-center text-xs font-black uppercase tracking-widest text-gray-400 group-hover:text-indigo-600 transition-colors">
        Explore Architecture <ArrowRight className="ml-2 w-4 h-4" />
      </div>
    </Link>
  );
};

const ArrowRight = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
  </svg>
);

export default HomePage;
