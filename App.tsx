
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { User, LayoutDashboard, UserPlus, MessageSquare, PlayCircle, Settings, LogOut, ChevronRight, Menu, X, Plus, Trash2 } from 'lucide-react';
import HomePage from './pages/HomePage';
import BuildPersonaPage from './pages/BuildPersonaPage';
import ChatPage from './pages/ChatPage';
import SimulationPage from './pages/SimulationPage';
import GalleryPage from './pages/GalleryPage';
import LoginPage from './pages/LoginPage';
import SettingsPage from './pages/SettingsPage';
import SyntheticUserDetail from './pages/info/SyntheticUserDetail';
import AdvisorDetail from './pages/info/AdvisorDetail';

const MenuBar: React.FC<{ user: any; onLogout: () => void }> = ({ user, onLogout }) => {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard },
    { label: 'Configure Agent', path: '/build', icon: UserPlus },
    { label: 'Agent Console', path: '/chat', icon: MessageSquare },
    { label: 'Outcome Sprints', path: '/simulate', icon: PlayCircle },
    { label: 'Deployed Agents', path: '/gallery', icon: User },
    { label: 'Settings', path: '/settings', icon: Settings },
  ];

  if (!user) return null;

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex-shrink-0 flex items-center gap-2">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">I</span>
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">
                Agentforce Coach
              </span>
            </Link>
            <div className="hidden sm:ml-8 sm:flex sm:space-x-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      isActive 
                        ? 'bg-indigo-50 text-indigo-700' 
                        : 'text-gray-600 hover:text-indigo-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
          <div className="hidden sm:flex sm:items-center sm:ml-6">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">{user.username}</span>
              <button
                onClick={onLogout}
                className="p-2 text-gray-500 hover:text-red-600 transition-colors"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex items-center sm:hidden">
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
            >
              {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <div className="sm:hidden bg-white border-t border-gray-100">
          <div className="pt-2 pb-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center px-4 py-3 text-base font-medium ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 border-l-4 border-indigo-700'
                      : 'text-gray-600 hover:bg-gray-50 border-l-4 border-transparent'
                  }`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.label}
                </Link>
              );
            })}
            <button
              onClick={onLogout}
              className="w-full flex items-center px-4 py-3 text-base font-medium text-gray-600 hover:bg-red-50 hover:text-red-700 transition-colors border-l-4 border-transparent"
            >
              <LogOut className="w-5 h-5 mr-3" />
              Logout
            </button>
          </div>
        </div>
      )}
    </nav>
  );
};

const App: React.FC = () => {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('spb_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  const handleLogin = (u: any) => {
    setUser(u);
    localStorage.setItem('spb_user', JSON.stringify(u));
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('spb_user');
  };

  return (
    <Router>
      <div className="min-h-screen flex flex-col">
        <MenuBar user={user} onLogout={handleLogout} />
        <main className="flex-grow flex flex-col">
          <Routes>
            <Route path="/login" element={user ? <Navigate to="/" /> : <LoginPage onLogin={handleLogin} />} />
            <Route path="/" element={user ? <HomePage /> : <Navigate to="/login" />} />
            <Route path="/build" element={user ? <BuildPersonaPage /> : <Navigate to="/login" />} />
            <Route path="/chat" element={user ? <ChatPage /> : <Navigate to="/login" />} />
            <Route path="/chat/:id" element={user ? <ChatPage /> : <Navigate to="/login" />} />
            <Route path="/simulate" element={user ? <SimulationPage /> : <Navigate to="/login" />} />
            <Route path="/gallery" element={user ? <GalleryPage /> : <Navigate to="/login" />} />
            <Route path="/settings" element={user ? <SettingsPage /> : <Navigate to="/login" />} />
            
            <Route path="/info/synthetic-user" element={user ? <SyntheticUserDetail /> : <Navigate to="/login" />} />
            <Route path="/info/advisor" element={user ? <AdvisorDetail /> : <Navigate to="/login" />} />

            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
};

export default App;
