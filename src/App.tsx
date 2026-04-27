import React, { Suspense } from 'react';
import { HashRouter as Router, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { User, LayoutDashboard, UserPlus, PlayCircle, Settings, LogOut, Menu, X, Shield, BookOpen, Briefcase } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext.js';
import { ApiErrorBanner } from './components/ApiErrorBanner.js';

const HomePage = React.lazy(() => import('./views/HomePage.js'));
const BuildPersonaPage = React.lazy(() => import('./views/BuildPersonaPage.js'));
const ChatPage = React.lazy(() => import('./views/ChatPage.js'));
const SimulationPage = React.lazy(() => import('./views/SimulationPage.js'));
const GalleryPage = React.lazy(() => import('./views/GalleryPage.js'));
const PersonaLibraryPage = React.lazy(() => import('./views/PersonaLibraryPage.js'));
const SettingsPage = React.lazy(() => import('./views/SettingsPage.js'));
const BusinessProfilePage = React.lazy(() => import('./views/BusinessProfilePage.js'));
const AdminPage = React.lazy(() => import('./views/AdminPage.js'));
const SyntheticUserDetail = React.lazy(() => import('./views/info/SyntheticUserDetail.js'));
const AdvisorDetail = React.lazy(() => import('./views/info/AdvisorDetail.js'));

const Sidebar: React.FC = () => {
  const location = useLocation();
  const { user, logout, isAdmin } = useAuth();
  const [isMobileOpen, setIsMobileOpen] = React.useState(false);

  const navItems = [
    { label: 'Dashboard', path: '/', icon: LayoutDashboard },
    { label: 'Simulation', path: '/simulate', icon: PlayCircle },
    { label: 'Build Persona', path: '/build', icon: UserPlus },
    { label: 'My Personas', path: '/gallery', icon: User },
    { label: 'Persona Library', path: '/library', icon: BookOpen },
    { label: 'Business Profile', path: '/business-profile', icon: Briefcase },
    { label: 'Settings', path: '/settings', icon: Settings },
    ...(isAdmin ? [{ label: 'Admin', path: '/admin', icon: Shield }] : []),
  ];

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={() => setIsMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-[80] p-2 rounded-md bg-white border border-gray-200 shadow-md text-gray-600 hover:text-gray-900 hover:bg-gray-50"
        aria-label="Open navigation menu"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-[70]"
          onClick={() => setIsMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-[75] flex flex-col transform transition-transform duration-300 ease-in-out ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Logo */}
        <div className="p-6 border-b border-gray-200">
          <Link to="/" className="flex items-center gap-2" onClick={() => setIsMobileOpen(false)}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">I</span>
            </div>
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
              Instinct AI
            </span>
          </Link>
        </div>

        {/* Navigation items */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setIsMobileOpen(false)}
                className={`flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-700 hover:bg-gray-100 hover:text-indigo-600'
                }`}
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-gray-200">
          {user ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700 truncate">{user.username}</span>
              </div>
              <button
                onClick={() => {
                  setIsMobileOpen(false);
                  logout();
                }}
                className="w-full flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-700 transition-colors"
              >
                <LogOut className="w-5 h-5 mr-2" />
                Logout
              </button>
            </>
          ) : (
            <div className="text-xs text-gray-500 px-2 py-1">Not logged in</div>
          )}
        </div>

        {/* Close button for mobile */}
        <button
          onClick={() => setIsMobileOpen(false)}
          className="lg:hidden absolute top-4 right-4 p-2 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
        >
          <X className="w-5 h-5" />
        </button>
      </aside>
    </>
  );
};



const AppRoutes: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-gray-500">Loading page...</div>
        </div>
      }
    >
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/build" element={<BuildPersonaPage />} />
        <Route path="/chat" element={<ChatPage />} />
        <Route path="/chat/:id" element={<ChatPage />} />
        <Route path="/simulate" element={<SimulationPage />} />
        <Route path="/business-profile" element={<BusinessProfilePage />} />
        <Route path="/gallery" element={<GalleryPage />} />
        <Route path="/library" element={<PersonaLibraryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/info/synthetic-user" element={<SyntheticUserDetail />} />
        <Route path="/info/advisor" element={<AdvisorDetail />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <div className="min-h-screen flex">
          <Sidebar />
          <main className="flex-1 lg:ml-64 flex flex-col min-w-0 overflow-x-hidden">
            <AppRoutes />
          </main>
        </div>
        <ApiErrorBanner />
      </Router>
    </AuthProvider>
  );
};

export default App;

