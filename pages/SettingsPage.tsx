
import React, { useState } from 'react';
import { 
  User, 
  Shield, 
  Bell, 
  Database, 
  Globe, 
  Lock, 
  Mail, 
  Trash2, 
  Download, 
  Eye, 
  EyeOff,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  Monitor,
  Plus
} from 'lucide-react';
import { storageService } from '../services/storage';

type SettingsTab = 'profile' | 'security' | 'notifications' | 'data' | 'language';

const SettingsLink: React.FC<{ icon: any; label: string; active: boolean; onClick: () => void }> = ({ icon: Icon, label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
      active 
        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' 
        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
    }`}
  >
    <Icon className="w-5 h-5" />
    {label}
  </button>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
    <h3 className="text-lg font-black text-gray-900 mb-6 uppercase tracking-tight">{title}</h3>
    {children}
  </div>
);

const InputField: React.FC<{ label: string; type?: string; defaultValue?: string; icon?: any; prefix?: string }> = ({ label, type = 'text', defaultValue, icon: Icon, prefix }) => (
  <div className="space-y-2">
    <label className="text-sm font-black text-gray-400 uppercase tracking-widest">{label}</label>
    <div className="relative">
      {Icon && <Icon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />}
      {prefix && <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-gray-400">{prefix}</span>}
      <input
        type={type}
        defaultValue={defaultValue}
        className={`w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-medium focus:ring-4 focus:ring-indigo-100 transition-all outline-none ${Icon || prefix ? 'pl-12' : ''}`}
      />
    </div>
  </div>
);

const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [showPassword, setShowPassword] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const handleSave = () => {
    setSaveStatus('Settings saved successfully!');
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleClearAll = async () => {
    if (window.confirm('Are you absolutely sure? This will delete all your personas, chats, and simulation history forever.')) {
      await storageService.clearAllData();
      alert('All data has been wiped.');
      window.location.reload();
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 w-full">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
          <h1 className="text-4xl font-black text-gray-900 tracking-tight">Settings</h1>
          <p className="text-gray-500 font-medium">Manage your account preferences and application data.</p>
        </div>
        {saveStatus && (
          <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-xl font-bold border border-green-100 animate-in fade-in slide-in-from-top-4">
            <CheckCircle2 className="w-5 h-5" />
            {saveStatus}
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <aside className="space-y-2">
          <SettingsLink 
            icon={User} 
            label="Profile" 
            active={activeTab === 'profile'} 
            onClick={() => setActiveTab('profile')} 
          />
          <SettingsLink 
            icon={Shield} 
            label="Security" 
            active={activeTab === 'security'} 
            onClick={() => setActiveTab('security')} 
          />
          <SettingsLink 
            icon={Bell} 
            label="Notifications" 
            active={activeTab === 'notifications'} 
            onClick={() => setActiveTab('notifications')} 
          />
          <SettingsLink 
            icon={Database} 
            label="Data & Storage" 
            active={activeTab === 'data'} 
            onClick={() => setActiveTab('data')} 
          />
          <SettingsLink 
            icon={Globe} 
            label="Language" 
            active={activeTab === 'language'} 
            onClick={() => setActiveTab('language')} 
          />
          
          <div className="pt-8 border-t border-gray-100 mt-4">
            <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold text-red-600 hover:bg-red-50 transition-all">
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </aside>

        <div className="md:col-span-3 space-y-8 animate-in fade-in duration-300">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <Section title="Public Profile">
                <div className="space-y-6">
                  <div className="flex items-center gap-6">
                    <div className="relative group">
                      <div className="w-24 h-24 bg-indigo-100 rounded-3xl flex items-center justify-center border-4 border-white shadow-xl overflow-hidden">
                        <User className="w-12 h-12 text-indigo-400" />
                      </div>
                      <button className="absolute -bottom-2 -right-2 p-2 bg-white border border-gray-100 rounded-xl shadow-lg text-indigo-600 hover:bg-gray-50 transition-all">
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-900">Avatar Image</h4>
                      <p className="text-sm text-gray-500">Square images work best. Max 5MB.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField label="Display Name" defaultValue="Demo User" />
                    <InputField label="Username" defaultValue="demouser_99" prefix="@" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-black text-gray-400 uppercase tracking-widest">Bio</label>
                    <textarea 
                      className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-medium focus:ring-4 focus:ring-indigo-100 transition-all outline-none h-32 resize-none"
                      placeholder="Tell the synthetic world about yourself..."
                    />
                  </div>
                </div>
              </Section>
              <div className="flex justify-end">
                <button onClick={handleSave} className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
                  Save Changes
                </button>
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="space-y-6">
              <Section title="Change Password">
                <div className="space-y-4">
                  <InputField label="Current Password" type={showPassword ? 'text' : 'password'} icon={Lock} />
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField label="New Password" type={showPassword ? 'text' : 'password'} icon={Lock} />
                    <InputField label="Confirm New Password" type={showPassword ? 'text' : 'password'} icon={Lock} />
                  </div>
                  <button 
                    onClick={() => setShowPassword(!showPassword)}
                    className="flex items-center gap-2 text-sm font-bold text-indigo-600 hover:text-indigo-700"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {showPassword ? 'Hide Passwords' : 'Show Passwords'}
                  </button>
                </div>
              </Section>
              <Section title="Two-Factor Authentication">
                <div className="flex items-center justify-between p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                  <div className="flex gap-4">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm text-indigo-600">
                      <Smartphone className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-bold text-gray-900">Authenticator App</p>
                      <p className="text-sm text-gray-500">Secure your account with TOTP (Google Authenticator, Authy, etc.)</p>
                    </div>
                  </div>
                  <button className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-100">
                    Enable
                  </button>
                </div>
              </Section>
            </div>
          )}

          {activeTab === 'notifications' && (
            <Section title="Notification Preferences">
              <div className="space-y-6">
                {[
                  { label: 'Intelligence Reports', desc: 'Get weekly summaries of your persona interactions.' },
                  { label: 'System Updates', desc: 'Important news about feature updates and maintenance.' },
                  { label: 'Security Alerts', desc: 'Notifications about login attempts and password changes.' }
                ].map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-gray-900">{item.label}</p>
                      <p className="text-sm text-gray-500">{item.desc}</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" className="sr-only peer" defaultChecked />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {activeTab === 'data' && (
            <div className="space-y-6">
              <Section title="Download My Data">
                <p className="text-sm text-gray-500 mb-6">Export all your personas, blueprints, and chat logs in JSON or Markdown format.</p>
                <div className="flex gap-4">
                  <button className="flex items-center gap-2 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all">
                    <Download className="w-4 h-4" /> Export JSON
                  </button>
                </div>
              </Section>
              <Section title="Danger Zone">
                <div className="p-6 border-2 border-red-100 bg-red-50 rounded-2xl space-y-4">
                  <div className="flex gap-4 items-start">
                    <AlertTriangle className="w-6 h-6 text-red-600 shrink-0" />
                    <div>
                      <p className="font-bold text-red-900">Clear All Intelligence Data</p>
                      <p className="text-sm text-red-700">This action cannot be undone. All locally stored personas and sessions will be permanently deleted.</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleClearAll}
                    className="w-full py-4 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100"
                  >
                    Wipe Database
                  </button>
                </div>
              </Section>
            </div>
          )}

          {activeTab === 'language' && (
            <Section title="Regional Settings">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-black text-gray-400 uppercase tracking-widest">Interface Language</label>
                  <select className="w-full bg-gray-50 border border-gray-100 rounded-2xl p-4 font-bold outline-none">
                    <option>English (US)</option>
                    <option>Spanish (Latin America)</option>
                    <option>French (France)</option>
                    <option>German (Germany)</option>
                  </select>
                </div>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
