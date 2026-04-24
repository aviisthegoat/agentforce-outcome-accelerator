import React, { useState, useEffect, useRef } from 'react';
import { CheckCircle2, AlertTriangle, Sparkles, Upload, Loader2, X } from 'lucide-react';
import { getBusinessProfile, saveBusinessProfile } from '../services/businessProfileApi.js';
import { geminiService, GEMINI_FILE_INPUT_ACCEPT } from '../services/gemini.js';

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
    <h3 className="text-lg font-black text-gray-900 mb-6 uppercase tracking-tight">{title}</h3>
    {children}
  </div>
);

const InputField: React.FC<{ label: string; type?: string; value?: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; icon?: any; prefix?: string; placeholder?: string }> = ({ label, type = 'text', value, onChange, icon: Icon, prefix, placeholder }) => (
  <div className="space-y-2">
    <label className="text-sm font-black text-gray-400 uppercase tracking-widest">{label}</label>
    <div className="relative">
      {Icon && <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />}
      {prefix && <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-medium focus:ring-4 focus:ring-indigo-100 transition-all outline-none ${Icon || prefix ? 'pl-12' : ''}`}
      />
    </div>
  </div>
);

const TextAreaField: React.FC<{ label: string; value?: string; onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void; placeholder?: string; rows?: number }> = ({ label, value, onChange, placeholder, rows = 3 }) => (
  <div className="space-y-2">
    <label className="text-sm font-black text-gray-400 uppercase tracking-widest">{label}</label>
    <textarea
      value={value ?? ''}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-medium focus:ring-4 focus:ring-indigo-100 transition-all outline-none resize-none"
    />
  </div>
);

const BusinessProfilePage: React.FC = () => {
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [businessName, setBusinessName] = useState('');
  const [missionStatement, setMissionStatement] = useState('');
  const [visionStatement, setVisionStatement] = useState('');
  const [descriptionMainOfferings, setDescriptionMainOfferings] = useState('');
  const [keyFeaturesOrBenefits, setKeyFeaturesOrBenefits] = useState('');
  const [uniqueSellingProposition, setUniqueSellingProposition] = useState('');
  const [pricingModel, setPricingModel] = useState('');
  const [customerSegments, setCustomerSegments] = useState('');
  const [geographicFocus, setGeographicFocus] = useState('');
  const [industryServed, setIndustryServed] = useState('');
  const [whatDifferentiates, setWhatDifferentiates] = useState('');
  const [marketNiche, setMarketNiche] = useState('');
  const [revenueStreams, setRevenueStreams] = useState('');
  const [distributionChannels, setDistributionChannels] = useState('');
  const [keyPersonnel, setKeyPersonnel] = useState('');
  const [majorAchievements, setMajorAchievements] = useState('');
  const [revenue, setRevenue] = useState('');
  const [keyPerformanceIndicators, setKeyPerformanceIndicators] = useState('');
  const [fundingRounds, setFundingRounds] = useState('');
  const [website, setWebsite] = useState('');
  const [businessProfileLoading, setBusinessProfileLoading] = useState(true);

  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateStage, setGenerateStage] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateFileName, setGenerateFileName] = useState('');
  const [generateFileData, setGenerateFileData] = useState<{ data: string; mimeType?: string } | null>(null);
  const [companyHint, setCompanyHint] = useState('');
  const generateCancelledRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setBusinessProfileLoading(true);
    getBusinessProfile()
      .then((profile) => {
        if (cancelled) return;
        if (profile) {
          setBusinessName(profile.business_name ?? '');
          setMissionStatement(profile.mission_statement ?? '');
          setVisionStatement(profile.vision_statement ?? '');
          setDescriptionMainOfferings(profile.description_main_offerings ?? '');
          setKeyFeaturesOrBenefits(profile.key_features_or_benefits ?? '');
          setUniqueSellingProposition(profile.unique_selling_proposition ?? '');
          setPricingModel(profile.pricing_model ?? '');
          setCustomerSegments(profile.customer_segments ?? '');
          setGeographicFocus(profile.geographic_focus ?? '');
          setIndustryServed(profile.industry_served ?? '');
          setWhatDifferentiates(profile.what_differentiates ?? '');
          setMarketNiche(profile.market_niche ?? '');
          setRevenueStreams(profile.revenue_streams ?? '');
          setDistributionChannels(profile.distribution_channels ?? '');
          setKeyPersonnel(profile.key_personnel ?? '');
          setMajorAchievements(profile.major_achievements ?? '');
          setRevenue(profile.revenue ?? '');
          setKeyPerformanceIndicators(profile.key_performance_indicators ?? '');
          setFundingRounds(profile.funding_rounds ?? '');
          setWebsite(profile.website ?? '');
        }
      })
      .finally(() => {
        if (!cancelled) setBusinessProfileLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleSaveBusiness = async () => {
    const payload = {
      business_name: businessName || null,
      mission_statement: missionStatement || null,
      vision_statement: visionStatement || null,
      description_main_offerings: descriptionMainOfferings || null,
      key_features_or_benefits: keyFeaturesOrBenefits || null,
      unique_selling_proposition: uniqueSellingProposition || null,
      pricing_model: pricingModel || null,
      customer_segments: customerSegments || null,
      geographic_focus: geographicFocus || null,
      industry_served: industryServed || null,
      what_differentiates: whatDifferentiates || null,
      market_niche: marketNiche || null,
      revenue_streams: revenueStreams || null,
      distribution_channels: distributionChannels || null,
      key_personnel: keyPersonnel || null,
      major_achievements: majorAchievements || null,
      revenue: revenue || null,
      key_performance_indicators: keyPerformanceIndicators || null,
      funding_rounds: fundingRounds || null,
      website: website || null,
    };
    try {
      await saveBusinessProfile(payload);
      setSaveStatus('Business Profile saved successfully!');
      setTimeout(() => setSaveStatus(null), 3000);
    } catch (err) {
      setSaveStatus(err instanceof Error ? err.message : 'Failed to save Business Profile');
      setTimeout(() => setSaveStatus(null), 5000);
    }
  };

  const handleGenerateFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setGenerateFileName('');
      setGenerateFileData(null);
      return;
    }
    setGenerateFileName(file.name);
    setGenerateError(null);
    const isBinary = ['application/pdf', 'image/'].some(t => (file.type || '').startsWith(t) || file.type === 'application/pdf');
    if (isBinary || !['text/plain', 'text/csv', 'application/json'].includes(file.type)) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setGenerateFileData({ data: (ev.target?.result as string) || '', mimeType: file.type || 'application/octet-stream' });
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setGenerateFileData({ data: (ev.target?.result as string) || '' });
      };
      reader.readAsText(file);
    }
  };

  const applyResultToForm = (result: Record<string, string | null>) => {
    if (result.business_name != null) setBusinessName(result.business_name ?? '');
    if (result.mission_statement != null) setMissionStatement(result.mission_statement ?? '');
    if (result.vision_statement != null) setVisionStatement(result.vision_statement ?? '');
    if (result.description_main_offerings != null) setDescriptionMainOfferings(result.description_main_offerings ?? '');
    if (result.key_features_or_benefits != null) setKeyFeaturesOrBenefits(result.key_features_or_benefits ?? '');
    if (result.unique_selling_proposition != null) setUniqueSellingProposition(result.unique_selling_proposition ?? '');
    if (result.pricing_model != null) setPricingModel(result.pricing_model ?? '');
    if (result.customer_segments != null) setCustomerSegments(result.customer_segments ?? '');
    if (result.geographic_focus != null) setGeographicFocus(result.geographic_focus ?? '');
    if (result.industry_served != null) setIndustryServed(result.industry_served ?? '');
    if (result.what_differentiates != null) setWhatDifferentiates(result.what_differentiates ?? '');
    if (result.market_niche != null) setMarketNiche(result.market_niche ?? '');
    if (result.revenue_streams != null) setRevenueStreams(result.revenue_streams ?? '');
    if (result.distribution_channels != null) setDistributionChannels(result.distribution_channels ?? '');
    if (result.key_personnel != null) setKeyPersonnel(result.key_personnel ?? '');
    if (result.major_achievements != null) setMajorAchievements(result.major_achievements ?? '');
    if (result.revenue != null) setRevenue(result.revenue ?? '');
    if (result.key_performance_indicators != null) setKeyPerformanceIndicators(result.key_performance_indicators ?? '');
    if (result.funding_rounds != null) setFundingRounds(result.funding_rounds ?? '');
    if (result.website != null) setWebsite(result.website ?? '');
  };

  const handleGenerateBusinessProfile = async () => {
    if (!generateFileData?.data && !companyHint.trim()) {
      setGenerateError('Upload a document and/or enter a company name or website to generate from.');
      return;
    }
    generateCancelledRef.current = false;
    setGenerateLoading(true);
    setGenerateError(null);
    setGenerateStage(null);
    const opts = { mimeType: generateFileData?.mimeType, companyHint: companyHint.trim() || undefined };
    const input = generateFileData?.data ?? companyHint.trim();
    try {
      setGenerateStage('Extracting Company Overview...');
      const company = await geminiService.generateBusinessProfileCompanyOverview(input, opts);
      if (generateCancelledRef.current) return;
      applyResultToForm(company);

      setGenerateStage('Extracting Market & Positioning...');
      const market = await geminiService.generateBusinessProfileMarketPositioning(input, opts);
      if (generateCancelledRef.current) return;
      applyResultToForm(market);

      setGenerateStage('Extracting Performance & Funding...');
      const performance = await geminiService.generateBusinessProfilePerformanceFunding(input, opts);
      if (generateCancelledRef.current) return;
      applyResultToForm(performance);

      setSaveStatus('Business Profile generated. Review and click Save to keep changes.');
      setTimeout(() => setSaveStatus(null), 5000);
    } catch (err) {
      if (!generateCancelledRef.current) {
        setGenerateError(err instanceof Error ? err.message : 'Failed to generate Business Profile.');
      }
    } finally {
      if (!generateCancelledRef.current) {
        setGenerateLoading(false);
        setGenerateStage(null);
      }
    }
  };

  const handleCancelGenerate = () => {
    generateCancelledRef.current = true;
    setGenerateLoading(false);
    setGenerateStage(null);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">Business Profile</h1>
          <p className="text-gray-500 font-medium">Your company background. Used when building personas or running simulations.</p>
        </div>
      </div>

      <div className="space-y-6">
        <p className="text-sm text-gray-500">Profile info about your company. Saved once here and used when building personas or running simulations. All fields are optional.</p>
        {businessProfileLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-500 font-medium">Loading Business Profile...</div>
        ) : (
          <>
            <Section title="Generate with AI">
              <p className="text-sm text-gray-500 mb-4">Upload a document (business plan, 10-K, pitch deck, etc.) and optionally add a company name or website. AI will fill in all profile fields using the document and public information.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-black text-gray-400 uppercase tracking-widest mb-2">Document (optional)</label>
                  <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 flex flex-col items-center justify-center text-center hover:border-indigo-200 transition-all bg-gray-50/50">
                    <Upload className="w-10 h-10 text-gray-400 mb-3" />
                    <p className="text-sm font-medium text-gray-600 mb-3">PDF, Word, text, or spreadsheet</p>
                    <input
                      type="file"
                      id="generate-bp-file"
                      className="hidden"
                      accept={GEMINI_FILE_INPUT_ACCEPT}
                      onChange={handleGenerateFileChange}
                    />
                    <label htmlFor="generate-bp-file" className="cursor-pointer px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all">
                      {generateFileName || 'Select document'}
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-black text-gray-400 uppercase tracking-widest mb-2">Company name or website (optional)</label>
                  <input
                    type="text"
                    value={companyHint}
                    onChange={(e) => { setCompanyHint(e.target.value); setGenerateError(null); }}
                    placeholder="e.g. Acme Inc or https://acme.com"
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-medium focus:ring-4 focus:ring-indigo-100 transition-all outline-none"
                  />
                  <p className="text-xs text-gray-500 mt-1">Adds context from public information (filings, website, news).</p>
                </div>
                {generateError && (
                  <div className="flex items-start gap-2 p-4 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
                    <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                    <span>{generateError}</span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleGenerateBusinessProfile}
                    disabled={generateLoading || (!generateFileData?.data && !companyHint.trim())}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {generateLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        {generateStage || 'Generating...'}
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Generate from document
                      </>
                    )}
                  </button>
                  {generateLoading && (
                    <button
                      type="button"
                      onClick={handleCancelGenerate}
                      className="flex items-center justify-center gap-2 px-6 py-3 border-2 border-red-200 text-red-600 rounded-xl font-bold hover:bg-red-50 transition-all"
                    >
                      <X className="w-5 h-5" />
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </Section>
            <Section title="Company Overview">
              <div className="space-y-4">
                <InputField label="Business Name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
                <TextAreaField label="Mission Statement" value={missionStatement} onChange={(e) => setMissionStatement(e.target.value)} placeholder="What is your company's mission?" />
                <TextAreaField label="Vision Statement" value={visionStatement} onChange={(e) => setVisionStatement(e.target.value)} placeholder="Where is your company headed?" />
                <TextAreaField label="Description of Main Offerings" value={descriptionMainOfferings} onChange={(e) => setDescriptionMainOfferings(e.target.value)} placeholder="Describe your main products or services" />
                <TextAreaField label="Key Features or Benefits" value={keyFeaturesOrBenefits} onChange={(e) => setKeyFeaturesOrBenefits(e.target.value)} placeholder="List key features or benefits" />
                <TextAreaField label="Unique Selling Proposition (USP)" value={uniqueSellingProposition} onChange={(e) => setUniqueSellingProposition(e.target.value)} placeholder="What makes you unique?" />
                <TextAreaField label="Pricing Model (if relevant)" value={pricingModel} onChange={(e) => setPricingModel(e.target.value)} placeholder="e.g. subscription, one-time, tiered" />
                <InputField label="Website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
              </div>
            </Section>
            <Section title="Market & Positioning">
              <div className="space-y-4">
                <TextAreaField label="Customer Segments" value={customerSegments} onChange={(e) => setCustomerSegments(e.target.value)} placeholder="Who are your target customers?" />
                <TextAreaField label="Geographic Focus" value={geographicFocus} onChange={(e) => setGeographicFocus(e.target.value)} placeholder="Regions or markets you serve" />
                <InputField label="Industry Served (B2B or B2C)" value={industryServed} onChange={(e) => setIndustryServed(e.target.value)} placeholder="e.g. B2B, B2C, both" />
                <TextAreaField label="What Differentiates the Company" value={whatDifferentiates} onChange={(e) => setWhatDifferentiates(e.target.value)} placeholder="What sets you apart from competitors?" />
                <TextAreaField label="Market Niche" value={marketNiche} onChange={(e) => setMarketNiche(e.target.value)} placeholder="Your specific market niche" />
                <TextAreaField label="Distribution Channels" value={distributionChannels} onChange={(e) => setDistributionChannels(e.target.value)} placeholder="How you reach customers" />
              </div>
            </Section>
            <Section title="Performance & Funding">
              <div className="space-y-4">
                <TextAreaField label="Key Personnel" value={keyPersonnel} onChange={(e) => setKeyPersonnel(e.target.value)} placeholder="Key team members or roles" />
                <TextAreaField label="Major Achievements" value={majorAchievements} onChange={(e) => setMajorAchievements(e.target.value)} placeholder="Notable milestones or wins" />
                <TextAreaField label="Revenue" value={revenue} onChange={(e) => setRevenue(e.target.value)} placeholder="Revenue or revenue range (if relevant)" />
                <TextAreaField label="Key Performance Indicators" value={keyPerformanceIndicators} onChange={(e) => setKeyPerformanceIndicators(e.target.value)} placeholder="KPIs you track" />
                <TextAreaField label="Funding Rounds" value={fundingRounds} onChange={(e) => setFundingRounds(e.target.value)} placeholder="e.g. Seed, Series A" />
                <TextAreaField label="Revenue Streams" value={revenueStreams} onChange={(e) => setRevenueStreams(e.target.value)} placeholder="How you generate revenue" />
              </div>
            </Section>
            <div className="flex justify-end items-center gap-4">
              {saveStatus && (
                <div className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold border animate-in fade-in slide-in-from-bottom-2 ${saveStatus.includes('saved successfully') || saveStatus.includes('generated') ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                  {saveStatus.includes('saved successfully') || saveStatus.includes('generated') ? <CheckCircle2 className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
                  {saveStatus}
                </div>
              )}
              <button onClick={handleSaveBusiness} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
                Save Business Profile
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BusinessProfilePage;
