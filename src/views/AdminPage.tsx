import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  User, 
  MessageSquare, 
  PlayCircle, 
  Plus, 
  Edit, 
  Trash2,
  Loader2,
  Shield,
  Database,
  AlertTriangle,
  CheckCircle2
} from 'lucide-react';
import { adminApi, AdminStats, UserWithStats, PersonaWithOwner, ReindexEvent } from '../services/adminApi.js';
import { simulationTemplateApi, SimulationTemplate, CreateSimulationRequest, UpdateSimulationRequest } from '../services/simulationTemplateApi.js';
import { SimulationTemplateForm } from '../components/SimulationTemplateForm.js';

type TabType = 'dashboard' | 'users' | 'personas' | 'simulations';

interface EmbedProgress {
  current: number;
  total: number;
  success: number;
  failed: number;
  errors: string[];
  done: boolean;
}

interface DiagResult {
  ok: boolean;
  checks: Record<string, { ok: boolean; detail: string }>;
}

const AdminPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<UserWithStats[]>([]);
  const [personas, setPersonas] = useState<PersonaWithOwner[]>([]);
  const [simulations, setSimulations] = useState<SimulationTemplate[]>([]);
  const [showSimulationForm, setShowSimulationForm] = useState(false);
  const [editingSimulation, setEditingSimulation] = useState<SimulationTemplate | null>(null);
  const [indexingPersonas, setIndexingPersonas] = useState(false);
  const [embedProgress, setEmbedProgress] = useState<EmbedProgress | null>(null);
  const [diagResult, setDiagResult] = useState<DiagResult | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const navigate = useNavigate();

  const handleTestEmbed = async () => {
    setDiagLoading(true);
    setDiagResult(null);
    try {
      const result = await adminApi.testEmbed();
      setDiagResult(result);
    } catch (err: any) {
      setDiagResult({ ok: false, checks: { connection: { ok: false, detail: err.message || 'Failed to reach server' } } });
    } finally {
      setDiagLoading(false);
    }
  };

  const handleReindexPersonas = async () => {
    setIndexingPersonas(true);
    setEmbedProgress({ current: 0, total: 0, success: 0, failed: 0, errors: [], done: false });
    try {
      await adminApi.reindexAllPersonasStream((event: ReindexEvent) => {
        if (event.type === 'progress') {
          setEmbedProgress(prev => {
            const next = { ...(prev || { current: 0, total: 0, success: 0, failed: 0, errors: [], done: false }) };
            next.current = event.current || next.current;
            next.total = event.total || next.total;
            if (event.status === 'success') next.success++;
            if (event.status === 'error') {
              next.failed++;
              if (event.error) next.errors.push(`${event.personaName}: ${event.error}`);
            }
            return next;
          });
        } else if (event.type === 'complete') {
          setEmbedProgress(prev => ({
            ...(prev || { current: 0, total: 0, errors: [] }),
            success: event.success || 0,
            failed: event.failed || 0,
            total: event.total || prev?.total || 0,
            current: event.total || prev?.total || 0,
            done: true,
          }));
        } else if (event.type === 'error') {
          setEmbedProgress(prev => ({
            ...(prev || { current: 0, total: 0, success: 0, failed: 0, errors: [] }),
            done: true,
            errors: [...(prev?.errors || []), event.error || 'Unknown error'],
          } as EmbedProgress));
        }
      });
    } catch (error: any) {
      setEmbedProgress(prev => ({
        ...(prev || { current: 0, total: 0, success: 0, failed: 0 }),
        done: true,
        errors: [error.message || 'Failed to connect to server.'],
      } as EmbedProgress));
    } finally {
      setIndexingPersonas(false);
      setTimeout(() => setEmbedProgress(null), 15000);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'dashboard') {
        const statsData = await adminApi.getStats();
        setStats(statsData);
      } else if (activeTab === 'users') {
        const usersData = await adminApi.getAllUsers();
        setUsers(usersData);
      } else if (activeTab === 'personas') {
        const personasData = await adminApi.getAllPersonas();
        setPersonas(personasData);
      } else if (activeTab === 'simulations') {
        const simsData = await simulationTemplateApi.getAllAdmin(true);
        setSimulations(simsData);
      }
    } catch (error: any) {
      console.error('Failed to load data:', error);
      alert(`Failed to load data: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSimulation = async (data: CreateSimulationRequest | UpdateSimulationRequest) => {
    try {
      if (editingSimulation) {
        await simulationTemplateApi.update(editingSimulation.id, data);
      } else {
        await simulationTemplateApi.create(data as CreateSimulationRequest);
      }
      setShowSimulationForm(false);
      setEditingSimulation(null);
      loadData();
    } catch (error: any) {
      throw error;
    }
  };

  const handleEditSimulation = (simulation: SimulationTemplate) => {
    setEditingSimulation(simulation);
    setShowSimulationForm(true);
  };

  const handleDeleteSimulation = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this simulation?')) {
      return;
    }
    try {
      await simulationTemplateApi.delete(id);
      loadData();
    } catch (error: any) {
      alert(`Failed to delete: ${error.message || 'Unknown error'}`);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const tabs = [
    { id: 'dashboard' as TabType, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'users' as TabType, label: 'Users', icon: Users },
    { id: 'personas' as TabType, label: 'Personas', icon: User },
    { id: 'simulations' as TabType, label: 'Simulations', icon: PlayCircle },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-indigo-600" />
            <h1 className="text-3xl font-black text-gray-900">Admin Panel</h1>
          </div>
          <p className="text-gray-600">Manage users, personas, and simulation templates</p>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                    ${isActive
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div>
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && stats && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Users</p>
                      <p className="text-3xl font-black text-gray-900 mt-2">{stats.total_users}</p>
                    </div>
                    <Users className="w-12 h-12 text-indigo-600 opacity-20" />
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Personas</p>
                      <p className="text-3xl font-black text-gray-900 mt-2">{stats.total_personas}</p>
                    </div>
                    <User className="w-12 h-12 text-indigo-600 opacity-20" />
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Chat Sessions</p>
                      <p className="text-3xl font-black text-gray-900 mt-2">{stats.total_chat_sessions}</p>
                    </div>
                    <MessageSquare className="w-12 h-12 text-indigo-600 opacity-20" />
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Messages</p>
                      <p className="text-3xl font-black text-gray-900 mt-2">{stats.total_messages}</p>
                    </div>
                    <MessageSquare className="w-12 h-12 text-indigo-600 opacity-20" />
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Simulation Sessions</p>
                      <p className="text-3xl font-black text-gray-900 mt-2">{stats.total_simulation_sessions}</p>
                    </div>
                    <PlayCircle className="w-12 h-12 text-indigo-600 opacity-20" />
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Admin Users</p>
                      <p className="text-3xl font-black text-gray-900 mt-2">{stats.admin_users}</p>
                    </div>
                    <Shield className="w-12 h-12 text-indigo-600 opacity-20" />
                  </div>
                </div>
                <div className={`bg-white rounded-lg shadow p-6 ${stats.unindexed_personas > 0 ? 'ring-2 ring-amber-300' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Needing Embedding</p>
                      <p className={`text-3xl font-black mt-2 ${stats.unindexed_personas > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {stats.unindexed_personas}
                      </p>
                    </div>
                    <Database className={`w-12 h-12 opacity-20 ${stats.unindexed_personas > 0 ? 'text-amber-600' : 'text-green-600'}`} />
                  </div>
                  {stats.unindexed_personas > 0 && (
                    <p className="text-xs text-amber-600 mt-2">Go to Personas tab to embed</p>
                  )}
                </div>
              </div>
            )}

            {/* Users Tab */}
            {activeTab === 'users' && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Username</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Personas</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Chats</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {users.map((user) => (
                        <tr key={user.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{user.username}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.email || '-'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.persona_count}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{user.chat_count}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {user.is_admin ? (
                              <span className="px-2 py-1 text-xs font-medium bg-indigo-100 text-indigo-800 rounded-full">Admin</span>
                            ) : (
                              <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">User</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(user.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Personas Tab */}
            {activeTab === 'personas' && (
              <div>
                {embedProgress && (
                  <div className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium border ${
                    embedProgress.done
                      ? embedProgress.failed > 0
                        ? 'bg-amber-50 text-amber-800 border-amber-200'
                        : 'bg-green-50 text-green-700 border-green-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}>
                    <div className="flex items-center gap-2 mb-2">
                      {embedProgress.done ? (
                        embedProgress.failed > 0 ? <AlertTriangle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                      ) : (
                        <Loader2 className="w-4 h-4 flex-shrink-0 animate-spin" />
                      )}
                      {embedProgress.done
                        ? embedProgress.total === 0
                          ? 'All personas already embedded. Nothing to do.'
                          : `Embedding complete: ${embedProgress.success} succeeded, ${embedProgress.failed} failed out of ${embedProgress.total}`
                        : `Embedding ${embedProgress.current} / ${embedProgress.total}...`
                      }
                    </div>
                    {embedProgress.total > 0 && (
                      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-300 ${embedProgress.failed > 0 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                          style={{ width: `${Math.round((embedProgress.current / embedProgress.total) * 100)}%` }}
                        />
                      </div>
                    )}
                    {embedProgress.errors.length > 0 && (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs font-semibold">
                          {embedProgress.errors.length} error{embedProgress.errors.length !== 1 ? 's' : ''} (click to expand)
                        </summary>
                        <ul className="mt-1 text-xs space-y-1 max-h-40 overflow-y-auto">
                          {embedProgress.errors.map((err, i) => (
                            <li key={i} className="break-all">{err}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>
                )}
                {diagResult && (
                  <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${diagResult.ok ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <div className="font-semibold mb-2">{diagResult.ok ? 'All checks passed' : 'Some checks failed'}</div>
                    <div className="space-y-1">
                      {Object.entries(diagResult.checks).map(([name, check]) => (
                        <div key={name} className="flex items-start gap-2">
                          {check.ok ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" /> : <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />}
                          <span><strong>{name.replace(/_/g, ' ')}:</strong> {check.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mb-4 flex justify-between items-center flex-wrap gap-2">
                  <h2 className="text-xl font-bold text-gray-900">All Personas</h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTestEmbed}
                      disabled={diagLoading}
                      className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50 text-sm"
                      title="Run diagnostics to check if embedding API is working"
                    >
                      {diagLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <AlertTriangle className="w-4 h-4" />}
                      Test Embed
                    </button>
                    <button
                      type="button"
                      onClick={handleReindexPersonas}
                      disabled={indexingPersonas}
                      className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Embed all personas for AI knowledge retrieval"
                    >
                      {indexingPersonas ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                      {indexingPersonas ? 'Embedding...' : 'Embed Personas'}
                    </button>
                    <button
                      onClick={() => navigate('/build?visibility=public')}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4" />
                      Create Persona
                    </button>
                  </div>
                </div>
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Owner</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {personas.map((persona) => (
                        <tr key={persona.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{persona.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{persona.type}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{persona.username}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(persona.created_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Simulations Tab */}
            {activeTab === 'simulations' && (
              <div>
                <div className="mb-4 flex justify-between items-center">
                  <h2 className="text-xl font-bold text-gray-900">Simulation Templates</h2>
                  {!showSimulationForm && (
                    <button
                      onClick={() => {
                        setEditingSimulation(null);
                        setShowSimulationForm(true);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4" />
                      Create Simulation
                    </button>
                  )}
                </div>

                {showSimulationForm ? (
                  <div className="bg-white rounded-lg shadow p-6 mb-6">
                    <h3 className="text-lg font-bold text-gray-900 mb-4">
                      {editingSimulation ? 'Edit Simulation' : 'Create New Simulation'}
                    </h3>
                    <SimulationTemplateForm
                      simulation={editingSimulation}
                      onSubmit={handleCreateSimulation}
                      onCancel={() => {
                        setShowSimulationForm(false);
                        setEditingSimulation(null);
                      }}
                    />
                  </div>
                ) : (
                  <div className="bg-white rounded-lg shadow overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Input Fields</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {simulations.map((sim) => (
                            <tr key={sim.id}>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{sim.title}</td>
                              <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">{sim.description || '-'}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{sim.required_input_fields.length}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {sim.is_active ? (
                                  <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Active</span>
                                ) : (
                                  <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">Inactive</span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleEditSimulation(sim)}
                                    className="text-indigo-600 hover:text-indigo-900"
                                  >
                                    <Edit className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSimulation(sim.id)}
                                    className="text-red-600 hover:text-red-900"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPage;


