import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Search, Filter, MessageSquare, Trash2, Calendar, User, FileText, X, ChevronRight, Download, Loader2, Star, Lock, Globe, Pencil, Check, Users, Plus, BookOpen } from 'lucide-react';
import { useAvailablePersonas } from '../hooks/usePersonas.js';
import { personaApi } from '../services/personaApi.js';
import { focusGroupApi } from '../services/focusGroupApi.js';
import { Persona, PersonaFile, FocusGroup } from '../models/types.js';
import { getPersonaDisplayName } from '../utils/humanNames.js';

type GalleryTab = 'my' | 'saved' | 'focusGroups';

const GalleryPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const { personas, loading, fetchPersonas } = useAvailablePersonas();
  const [activeTab, setActiveTab] = useState<GalleryTab>(() => {
    if (tabParam === 'saved' || tabParam === 'focusGroups') return tabParam;
    return 'my';
  });

  // Sync URL tab param when activeTab changes
  useEffect(() => {
    if (tabParam !== activeTab) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        if (activeTab === 'my') next.delete('tab');
        else next.set('tab', activeTab);
        return next;
      }, { replace: true });
    }
  }, [activeTab, tabParam, setSearchParams]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [viewingFilesPersona, setViewingFilesPersona] = useState<Persona | null>(null);
  const [personaFiles, setPersonaFiles] = useState<Record<string, PersonaFile[]>>({});
  const [loadingFiles, setLoadingFiles] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [starringId, setStarringId] = useState<string | null>(null);
  const [unstarringId, setUnstarringId] = useState<string | null>(null);
  const [updatingVisibilityId, setUpdatingVisibilityId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState('');
  const [savingNameId, setSavingNameId] = useState<string | null>(null);

  const [focusGroups, setFocusGroups] = useState<FocusGroup[]>([]);
  const [focusGroupsLoading, setFocusGroupsLoading] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<FocusGroup | null>(null);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  useEffect(() => {
    // Load files when viewing a persona
    if (viewingFilesPersona && !personaFiles[viewingFilesPersona.id]) {
      loadPersonaFiles(viewingFilesPersona.id);
    }
  }, [viewingFilesPersona]);

  const loadFocusGroups = async () => {
    setFocusGroupsLoading(true);
    try {
      const list = await focusGroupApi.getAll();
      setFocusGroups(list);
    } catch (err) {
      console.error('Failed to load focus groups:', err);
    } finally {
      setFocusGroupsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'focusGroups') {
      loadFocusGroups();
    }
  }, [activeTab]);

  const loadPersonaFiles = async (personaId: string) => {
    if (loadingFiles[personaId]) return;
    setLoadingFiles(prev => ({ ...prev, [personaId]: true }));
    try {
      const files = await personaApi.getFiles(personaId);
      // Normalize file format
      const normalized = files.map(f => ({
        ...f,
        createdAt: f.created_at || f.createdAt,
      }));
      setPersonaFiles(prev => ({ ...prev, [personaId]: normalized }));
    } catch (err) {
      console.error('Failed to load persona files:', err);
    } finally {
      setLoadingFiles(prev => ({ ...prev, [personaId]: false }));
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this persona? This action cannot be undone.')) {
      setDeletingId(id);
      try {
        await personaApi.delete(id);
        await fetchPersonas();
      } catch (err: any) {
        alert(err.message || 'Could not delete persona. Please try again.');
      } finally {
        setDeletingId(null);
      }
    }
  };

  const handleStar = async (id: string) => {
    setStarringId(id);
    try {
      await personaApi.star(id);
      await fetchPersonas();
    } catch (err: any) {
      alert(err?.message || 'Could not save persona. Please try again.');
    } finally {
      setStarringId(null);
    }
  };

  const handleUnstar = async (id: string) => {
    setUnstarringId(id);
    try {
      await personaApi.unstar(id);
      await fetchPersonas();
    } catch (err: any) {
      alert(err.message || 'Could not remove persona. Please try again.');
    } finally {
      setUnstarringId(null);
    }
  };

  const handleVisibilityChange = async (id: string, visibility: 'public' | 'private') => {
    setUpdatingVisibilityId(id);
    try {
      await personaApi.update(id, { visibility });
      await fetchPersonas();
    } catch (err: any) {
      alert(err?.message || 'Could not update visibility. Please try again.');
    } finally {
      setUpdatingVisibilityId(null);
    }
  };

  const handleStartEditName = (persona: Persona) => {
    setEditingNameId(persona.id);
    setEditingNameValue(persona.name?.trim() || getPersonaDisplayName(persona));
  };

  const handleCancelEditName = () => {
    setEditingNameId(null);
    setEditingNameValue('');
  };

  const handleSaveName = async (id: string) => {
    const name = editingNameValue.trim();
    if (!name) {
      alert('Name cannot be empty.');
      return;
    }
    setSavingNameId(id);
    try {
      await personaApi.update(id, { name });
      await fetchPersonas();
      setEditingNameId(null);
      setEditingNameValue('');
    } catch (err: any) {
      alert(err?.message || 'Could not update name. Please try again.');
    } finally {
      setSavingNameId(null);
    }
  };

  const filteredPersonas = personas.filter(p => {
    const matchesTab =
      activeTab === 'my' ? p.source === 'owned' :
      activeTab === 'saved' ? (p.source === 'starred' || (p.source === 'owned' && p.starred)) :
      true;
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) ||
                          p.description.toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || p.type === typeFilter;
    return matchesTab && matchesSearch && matchesType;
  });

  // Normalize persona data for display
  const normalizedPersonas = filteredPersonas.map(p => ({
    ...p,
    avatarUrl: p.avatarUrl || p.avatar_url,
    createdAt: p.createdAt || p.created_at,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full relative">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Personas</h1>
          <p className="text-gray-500">
            {activeTab === 'my' && 'Personas you created.'}
            {activeTab === 'saved' && 'Personas you saved from the Persona Library.'}
            {activeTab === 'focusGroups' && 'Groups you can add all at once in Chat or Simulation.'}
          </p>
        </div>
        {activeTab === 'my' ? (
          <Link
            to="/build"
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
          >
            <User className="w-4 h-4 mr-2" /> New Persona
          </Link>
        ) : activeTab === 'focusGroups' ? (
          <button
            type="button"
            onClick={() => setCreateGroupOpen(true)}
            className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
          >
            <Plus className="w-4 h-4 mr-2" /> Create focus group
          </button>
        ) : null}
      </div>

      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl mb-6 w-fit">
        {(['my', 'saved', 'focusGroups'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2.5 rounded-lg font-semibold text-sm transition-all ${activeTab === tab ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
          >
            {tab === 'my' && 'My Personas'}
            {tab === 'saved' && 'Saved Personas'}
            {tab === 'focusGroups' && 'Focus Groups'}
          </button>
        ))}
      </div>

      {(activeTab === 'my' || activeTab === 'saved') && (
      <>
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm mb-8 flex flex-col md:flex-row gap-4">
        <div className="flex-grow relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Search personas..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 transition-all"
          />
        </div>
        <div className="flex items-center gap-2">
           <Filter className="text-gray-400 w-5 h-5" />
           <select
             value={typeFilter}
             onChange={e => setTypeFilter(e.target.value)}
             className="border border-gray-200 rounded-xl py-2 px-4 text-sm focus:ring-2 focus:ring-indigo-500"
           >
             <option value="all">All Types</option>
             <option value="synthetic_user">Synthetic User</option>
             <option value="advisor">Advisor</option>
           </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      ) : normalizedPersonas.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {normalizedPersonas.map((persona) => (
            <PersonaCard
              key={persona.id}
              persona={persona}
              isDeleting={deletingId === persona.id}
              isStarring={starringId === persona.id}
              isUnstarring={unstarringId === persona.id}
              isUpdatingVisibility={updatingVisibilityId === persona.id}
              isEditingName={editingNameId === persona.id}
              editingNameValue={editingNameId === persona.id ? editingNameValue : ''}
              isSavingName={savingNameId === persona.id}
              onDelete={() => handleDelete(persona.id)}
              onStar={persona.source === 'owned' ? () => handleStar(persona.id) : undefined}
              onUnstar={(persona.source === 'starred' || (persona.source === 'owned' && persona.starred)) ? () => handleUnstar(persona.id) : undefined}
              onVisibilityChange={persona.source === 'owned' ? (visibility) => handleVisibilityChange(persona.id, visibility) : undefined}
              onStartEditName={persona.source === 'owned' ? () => handleStartEditName(persona) : undefined}
              onSaveName={persona.source === 'owned' ? () => handleSaveName(persona.id) : undefined}
              onCancelEditName={handleCancelEditName}
              onEditingNameChange={editingNameId === persona.id ? setEditingNameValue : undefined}
              onViewFiles={() => setViewingFilesPersona(persona)}
            />
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
          {activeTab === 'saved' ? (
            <>
              <BookOpen className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No saved personas yet</h3>
              <p className="text-gray-500">Star personas from the Persona Library to add them here.</p>
              <Link to="/library" className="mt-4 inline-block text-indigo-600 font-semibold hover:underline">Browse Persona Library</Link>
            </>
          ) : (
            <>
              <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No personas found</h3>
              <p className="text-gray-500">Start by building your first synthetic persona.</p>
              <Link to="/build" className="mt-4 inline-block text-indigo-600 font-semibold hover:underline">Build Persona</Link>
            </>
          )}
        </div>
      )}

      </>
      )}

      {activeTab === 'focusGroups' && (
        <>
          {focusGroupsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
          ) : focusGroups.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {focusGroups.map((group) => (
                <div
                  key={group.id}
                  className="bg-white border border-gray-100 rounded-2xl p-6 flex flex-col h-full hover:shadow-xl transition-all"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      <Users className="w-5 h-5 text-indigo-500" />
                      {group.name}
                    </h3>
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingGroup(group)}
                        className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                        title="Edit group"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(`Delete "${group.name}"?`)) return;
                          setDeletingGroupId(group.id);
                          try {
                            await focusGroupApi.delete(group.id);
                            await loadFocusGroups();
                          } catch (err: any) {
                            alert(err?.message || 'Could not delete group.');
                          } finally {
                            setDeletingGroupId(null);
                          }
                        }}
                        disabled={deletingGroupId === group.id}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete group"
                      >
                        {deletingGroupId === group.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-gray-500 text-sm mb-4">
                    {group.personaIds.length} persona{group.personaIds.length !== 1 ? 's' : ''}
                  </p>
                  <div className="mt-auto">
                    <button
                      type="button"
                      onClick={() => setEditingGroup(group)}
                      className="w-full py-3 bg-indigo-50 text-indigo-700 rounded-xl font-bold hover:bg-indigo-100 transition-all flex items-center justify-center gap-2"
                    >
                      <Pencil className="w-4 h-4" /> Edit personas
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-20 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No focus groups yet</h3>
              <p className="text-gray-500">Create a group to add multiple personas at once in Chat or Simulation.</p>
              <button
                type="button"
                onClick={() => setCreateGroupOpen(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700"
              >
                <Plus className="w-4 h-4" /> Create focus group
              </button>
            </div>
          )}
        </>
      )}

      {/* Blueprint/Files Modal */}
      {viewingFilesPersona && (
        <FileViewerModal 
          persona={viewingFilesPersona}
          files={personaFiles[viewingFilesPersona.id] || []}
          loadingFiles={loadingFiles[viewingFilesPersona.id]}
          onClose={() => setViewingFilesPersona(null)} 
        />
      )}

      {/* Create Focus Group Modal */}
      {createGroupOpen && (
        <CreateFocusGroupModal
          onClose={() => setCreateGroupOpen(false)}
          onCreated={async (group) => {
            setCreateGroupOpen(false);
            await loadFocusGroups();
          }}
        />
      )}

      {/* Edit Focus Group Modal */}
      {editingGroup && (
        <EditFocusGroupModal
          group={editingGroup}
          availablePersonas={personas.map(p => ({ ...p, avatarUrl: p.avatarUrl || p.avatar_url }))}
          onClose={() => setEditingGroup(null)}
          onSaved={async () => {
            setEditingGroup(null);
            await loadFocusGroups();
          }}
        />
      )}
    </div>
  );
};

const CreateFocusGroupModal: React.FC<{
  onClose: () => void;
  onCreated: (group: FocusGroup) => void;
}> = ({ onClose, onCreated }) => {
  const [name, setName] = useState('');
  const [allowedRole, setAllowedRole] = useState('');
  const [saving, setSaving] = useState(false);
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const group = await focusGroupApi.create({
        name: trimmed,
        allowedPersonaTypes: allowedRole ? [allowedRole] : undefined,
      });
      onCreated(group);
    } catch (err: any) {
      alert(err?.message || 'Could not create group.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl p-8">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Create focus group</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Boutique Owners"
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Role (optional)</label>
            <select
              value={allowedRole}
              onChange={e => setAllowedRole(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              {FOCUS_GROUP_ROLE_OPTIONS.map(opt => (
                <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-gray-500">Restrict this group to personas with this role. You can change it when editing the group.</p>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200">
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim()} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const FOCUS_GROUP_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All personas' },
  { value: 'synthetic_user', label: 'Synthetic User' },
  { value: 'advisor', label: 'Advisor' },
];

const EditFocusGroupModal: React.FC<{
  group: FocusGroup;
  availablePersonas: Persona[];
  onClose: () => void;
  onSaved: () => void;
}> = ({ group, availablePersonas, onClose, onSaved }) => {
  const [name, setName] = useState(group.name);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(group.personaIds));
  const [saving, setSaving] = useState(false);
  const role = (group.allowedPersonaTypes?.length ? group.allowedPersonaTypes[0] : '') || '';
  const [allowedRole, setAllowedRole] = useState(role);
  const filteredPersonas = allowedRole
    ? availablePersonas.filter(p => p.type === allowedRole)
    : availablePersonas;
  const roleLabel = FOCUS_GROUP_ROLE_OPTIONS.find(o => o.value === allowedRole)?.label || allowedRole.replace(/_/g, ' ');
  const togglePersona = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await focusGroupApi.update(group.id, {
        name: name.trim(),
        personaIds: Array.from(selectedIds),
        allowedPersonaTypes: allowedRole ? [allowedRole] : undefined,
      });
      onSaved();
    } catch (err: any) {
      alert(err?.message || 'Could not save.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white w-full max-w-lg max-h-[90vh] rounded-2xl shadow-xl flex flex-col overflow-hidden">
        <div className="p-8 border-b border-gray-100">
          <h3 className="text-xl font-bold text-gray-900 mb-4">Edit focus group</h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Role (personas in this group)</label>
              <select
                value={allowedRole}
                onChange={e => setAllowedRole(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 bg-white"
              >
                {FOCUS_GROUP_ROLE_OPTIONS.map(opt => (
                  <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {allowedRole ? (
                <p className="mt-1.5 text-xs text-gray-500">Only personas with role “{roleLabel}” are listed below.</p>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Personas in this group</label>
              <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-xl divide-y divide-gray-100">
                {filteredPersonas.length === 0 ? (
                  <p className="p-4 text-gray-500 text-sm">
                    {allowedRole
                      ? `No personas with role “${roleLabel}” found. Create or add personas with that role, or choose “All personas” above.`
                      : 'No personas available. Add personas from My Personas or Saved Personas first.'}
                  </p>
                ) : (
                  filteredPersonas.map(p => (
                    <label key={p.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        onChange={() => togglePersona(p.id)}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600"
                      />
                      <img src={p.avatarUrl || p.avatar_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                      <span className="font-medium text-gray-900 truncate">{getPersonaDisplayName(p)}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

const PersonaCard: React.FC<{ 
  persona: Persona; 
  isDeleting: boolean;
  isStarring?: boolean;
  isUnstarring?: boolean;
  isUpdatingVisibility?: boolean;
  isEditingName?: boolean;
  editingNameValue: string;
  isSavingName?: boolean;
  onDelete: () => void; 
  onStar?: () => void;
  onUnstar?: () => void;
  onVisibilityChange?: (visibility: 'public' | 'private') => void;
  onStartEditName?: () => void;
  onSaveName?: () => void;
  onCancelEditName: () => void;
  onEditingNameChange?: (value: string) => void;
  onViewFiles: () => void;
}> = ({ persona, isDeleting, isStarring, isUnstarring, isUpdatingVisibility, isEditingName, editingNameValue, isSavingName, onDelete, onStar, onUnstar, onVisibilityChange, onStartEditName, onSaveName, onCancelEditName, onEditingNameChange, onViewFiles }) => {
  const navigate = useNavigate();
  const isOwned = persona.source === 'owned';
  const isStarred = persona.source === 'starred' || persona.starred;
  const isPublic = (persona.visibility || 'private') === 'public';

  const typeLabels: Record<string, { label: string; color: string }> = {
    synthetic_user: { label: 'Synthetic User', color: 'bg-blue-100 text-blue-700' },
    advisor: { label: 'Advisor', color: 'bg-purple-100 text-purple-700' },
  };

  const avatarUrl = persona.avatarUrl || persona.avatar_url;
  const createdAt = persona.createdAt || persona.created_at;

  return (
    <div className={`bg-white border border-gray-100 rounded-2xl overflow-hidden group hover:shadow-xl transition-all flex flex-col h-full ${isDeleting || isStarring || isUnstarring ? 'opacity-50 pointer-events-none' : ''}`}>
      <div className="relative h-48 bg-gray-100 flex items-center justify-center overflow-hidden">
        <img
          src={avatarUrl}
          alt={getPersonaDisplayName(persona)}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
        />
        <div className="absolute top-4 right-4 flex gap-2 z-10">
           <button
             onClick={(e) => {
               e.stopPropagation();
               onViewFiles();
             }}
             className="p-2 bg-white/80 backdrop-blur rounded-lg text-indigo-600 hover:bg-white transition-colors shadow-sm cursor-pointer"
             title="View Blueprint Files"
           >
             <FileText className="w-4 h-4" />
           </button>
           {(isStarred && onUnstar) || (!isStarred && onStar) ? (
             <button
               onClick={(e) => {
                 e.stopPropagation();
                 if (isStarred && onUnstar) onUnstar();
                 else if (!isStarred && onStar) onStar();
               }}
               disabled={isStarring || isUnstarring}
               className={`p-2 rounded-lg transition-colors shadow-sm cursor-pointer ${
                 isStarred ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'bg-white/80 backdrop-blur text-gray-400 hover:bg-white hover:text-amber-600'
               }`}
               title={isStarred ? 'Remove from Saved Personas' : 'Add to Saved Personas'}
             >
               {(isStarring || isUnstarring) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className={`w-4 h-4 ${isStarred ? 'fill-current' : ''}`} />}
             </button>
           ) : null}
           {isOwned && (
             <button
               onClick={(e) => {
                 e.stopPropagation();
                 onDelete();
               }}
               disabled={isDeleting}
               className={`p-2 bg-white/80 backdrop-blur rounded-lg text-red-600 hover:bg-white transition-colors shadow-sm cursor-pointer ${isDeleting ? 'animate-pulse' : ''}`}
               title="Delete Persona"
             >
               {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
             </button>
           )}
        </div>
        <div className="absolute bottom-4 left-4 flex gap-2 flex-wrap">
          <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${typeLabels[persona.type]?.color || 'bg-gray-100 text-gray-700'}`}>
            {typeLabels[persona.type]?.label || persona.type}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${isPublic ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600'}`}>
            {isPublic ? 'Public' : 'Private'}
          </span>
        </div>
      </div>
      <div className="p-6 flex-grow flex flex-col">
        {isEditingName ? (
          <div className="mb-4 space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase tracking-widest">Name</label>
            <input
              type="text"
              value={editingNameValue}
              onChange={(e) => onEditingNameChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveName?.();
                if (e.key === 'Escape') onCancelEditName();
              }}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 font-bold text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              placeholder="Persona name"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onSaveName?.()}
                disabled={isSavingName || !editingNameValue.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSavingName ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Save
              </button>
              <button
                type="button"
                onClick={onCancelEditName}
                disabled={isSavingName}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="text-xl font-bold text-gray-900 min-w-0">{getPersonaDisplayName(persona)}</h3>
              {isOwned && onStartEditName && (
                <button
                  type="button"
                  onClick={onStartEditName}
                  className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
                  title="Edit name"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              )}
            </div>
            <p className="text-gray-500 text-sm mb-4 line-clamp-2">{persona.description}</p>
          </>
        )}

        <div className="flex items-center text-xs text-gray-400 mb-4">
          <Calendar className="w-3 h-3 mr-1" /> {createdAt ? new Date(createdAt).toLocaleDateString() : 'N/A'}
        </div>

        <div className="flex flex-col gap-2 mt-auto">
          {isOwned && onVisibilityChange && (
            <button
              type="button"
              onClick={() => onVisibilityChange(isPublic ? 'private' : 'public')}
              disabled={isUpdatingVisibility}
              className={`w-full inline-flex items-center justify-center gap-2 px-3 py-3 rounded-xl text-xs font-bold transition-all ${
                isPublic 
                  ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' 
                  : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              } ${isUpdatingVisibility ? 'opacity-70 cursor-wait' : 'cursor-pointer'}`}
              title={isPublic ? 'Make private (only you can see this persona)' : 'Make public (others can discover this persona)'}
            >
              {isUpdatingVisibility ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isPublic ? (
                <Lock className="w-3.5 h-3.5" />
              ) : (
                <Globe className="w-3.5 h-3.5" />
              )}
              {isUpdatingVisibility ? 'Updating...' : isPublic ? 'Make Private' : 'Make Public'}
            </button>
          )}
          <button
            onClick={onViewFiles}
            className="w-full py-3 bg-gray-50 text-gray-700 rounded-xl font-bold hover:bg-gray-100 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <FileText className="w-4 h-4" /> Files
          </button>
          <button
            onClick={() => navigate(`/chat?personaId=${persona.id}`)}
            className="w-full py-3 bg-indigo-50 text-indigo-700 rounded-xl font-bold hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageSquare className="w-4 h-4" /> Chat
          </button>
        </div>
      </div>
    </div>
  );
};

const FileViewerModal: React.FC<{ 
  persona: Persona; 
  files: PersonaFile[];
  loadingFiles: boolean;
  onClose: () => void;
}> = ({ persona, files, loadingFiles, onClose }) => {
  const [selectedFile, setSelectedFile] = useState<PersonaFile | null>(files[0] || null);

  useEffect(() => {
    if (files.length > 0 && !selectedFile) {
      setSelectedFile(files[0]);
    }
  }, [files]);

  const avatarUrl = persona.avatarUrl || persona.avatar_url;

  const handleDownload = () => {
    if (!selectedFile) return;
    
    // Create a blob with the file content
    const blob = new Blob([selectedFile.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    
    // Create a temporary anchor element and trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = selectedFile.name.endsWith('.md') ? selectedFile.name : `${selectedFile.name}.md`;
    document.body.appendChild(link);
    link.click();
    
    // Clean up
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={onClose}></div>
      <div className="relative bg-white w-full max-w-5xl h-[85vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row animate-in zoom-in-95 duration-200">
        
        {/* Sidebar - File List */}
        <aside className="w-full md:w-[22rem] min-w-[18rem] bg-gray-50 border-r border-gray-100 flex flex-col overflow-hidden">
          <div className="p-8 border-b border-gray-100 bg-white">
            <div className="flex items-center gap-3 mb-2 min-w-0">
              <img src={avatarUrl} alt={getPersonaDisplayName(persona)} className="w-10 h-10 rounded-xl object-cover shrink-0" />
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900 truncate">{getPersonaDisplayName(persona)}</h3>
                <p className="text-xs text-indigo-600 font-bold uppercase tracking-wider">Blueprint Files</p>
              </div>
            </div>
          </div>
          <div className="flex-grow overflow-y-auto p-4 space-y-2">
            {loadingFiles ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 text-indigo-600 animate-spin" />
              </div>
            ) : files.length > 0 ? (
              files.map((file) => (
                <button
                  key={file.id}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-left p-4 rounded-2xl flex items-center justify-between transition-all cursor-pointer ${
                    selectedFile?.id === file.id 
                    ? 'bg-white shadow-lg shadow-gray-200/50 text-indigo-600 border border-gray-100' 
                    : 'text-gray-600 hover:bg-white hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className={`w-5 h-5 shrink-0 ${selectedFile?.id === file.id ? 'text-indigo-600' : 'text-gray-400'}`} />
                    <span className="text-sm font-bold truncate">{file.name}</span>
                  </div>
                  <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${selectedFile?.id === file.id ? 'rotate-90 translate-x-1' : ''}`} />
                </button>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">
                No files available
              </div>
            )}
          </div>
          <div className="p-6 bg-white border-t border-gray-100">
            <button 
              onClick={onClose}
              className="w-full py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Close Viewer
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-grow flex flex-col bg-white overflow-hidden relative">
          <div className="absolute top-6 right-6 z-10">
            <button onClick={onClose} className="p-3 bg-gray-100 text-gray-400 rounded-2xl hover:bg-gray-200 hover:text-gray-900 transition-all cursor-pointer">
              <X className="w-6 h-6" />
            </button>
          </div>

          {selectedFile ? (
            <div className="flex-grow flex flex-col overflow-hidden">
              <header className="px-10 pt-10 pb-6 border-b border-gray-50">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-black text-gray-900 mb-1">{selectedFile.name}</h2>
                    <p className="text-sm text-gray-400 font-medium">Blueprint source generated by Gemini 3</p>
                  </div>
                  <button 
                    onClick={handleDownload}
                    className="hidden sm:flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-100 transition-all cursor-pointer"
                  >
                    <Download className="w-4 h-4" /> Download .md
                  </button>
                </div>
              </header>
              <div className="flex-grow overflow-y-auto p-10 bg-gray-50/30">
                <div className="bg-white p-8 sm:p-12 rounded-3xl border border-gray-100 shadow-sm max-w-4xl mx-auto min-h-full">
                   <pre className="whitespace-pre-wrap font-sans text-gray-700 leading-relaxed text-base">
                     {selectedFile.content}
                   </pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-grow flex items-center justify-center p-12 text-center">
              <div className="max-w-md">
                <div className="w-20 h-20 bg-gray-50 text-gray-300 rounded-3xl flex items-center justify-center mx-auto mb-6">
                  <FileText className="w-10 h-10" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No file selected</h3>
                <p className="text-gray-500">Select a file from the sidebar to view its blueprint data.</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default GalleryPage;
