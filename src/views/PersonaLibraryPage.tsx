import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, MessageSquare, FileText, Star, Loader2, Library } from 'lucide-react';
import { personaApi } from '../services/personaApi.js';
import { Persona, PersonaFile } from '../models/types.js';
import { getPersonaDisplayName } from '../utils/humanNames.js';

const PersonaLibraryPage: React.FC = () => {
  const [libraryPersonas, setLibraryPersonas] = useState<Persona[]>([]);
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [togglingStarId, setTogglingStarId] = useState<string | null>(null);
  const [viewingFilesPersona, setViewingFilesPersona] = useState<Persona | null>(null);
  const [personaFiles, setPersonaFiles] = useState<Record<string, PersonaFile[]>>({});
  const [loadingFiles, setLoadingFiles] = useState<Record<string, boolean>>({});

  const loadLibrary = async () => {
    try {
      const data = await personaApi.getLibrary();
      setLibraryPersonas(data.map(p => ({ ...p, avatarUrl: p.avatarUrl || p.avatar_url, createdAt: p.created_at || p.createdAt })));
    } catch (err) {
      console.error('Failed to load library:', err);
    }
  };

  const loadStarredIds = async () => {
    try {
      const data = await personaApi.getStarred();
      setStarredIds(new Set(data.map(p => p.id)));
    } catch (err) {
      console.error('Failed to load starred:', err);
    }
  };

  useEffect(() => {
    setLoading(true);
    loadLibrary()
      .then(() => setLoading(false))
      .catch(() => setLoading(false));
    loadStarredIds().catch(() => {});
  }, []);

  useEffect(() => {
    if (viewingFilesPersona && !personaFiles[viewingFilesPersona.id]) {
      if (loadingFiles[viewingFilesPersona.id]) return;
      setLoadingFiles(prev => ({ ...prev, [viewingFilesPersona.id]: true }));
      personaApi.getFiles(viewingFilesPersona.id)
        .then(files => {
          const normalized = files.map(f => ({ ...f, createdAt: f.created_at || (f as any).createdAt }));
          setPersonaFiles(prev => ({ ...prev, [viewingFilesPersona.id]: normalized }));
        })
        .catch(console.error)
        .finally(() => setLoadingFiles(prev => ({ ...prev, [viewingFilesPersona.id]: false })));
    }
  }, [viewingFilesPersona]);

  const handleToggleStar = async (persona: Persona) => {
    const id = persona.id;
    const isStarred = starredIds.has(id);
    setTogglingStarId(id);
    try {
      if (isStarred) {
        await personaApi.unstar(id);
        setStarredIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        await personaApi.star(id);
        setStarredIds(prev => new Set([...prev, id]));
      }
    } catch (err: any) {
      alert(err.message || 'Failed to update star');
    } finally {
      setTogglingStarId(null);
    }
  };

  const filtered = libraryPersonas.filter(p => {
    const matchesSearch = (p.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.description || '').toLowerCase().includes(search.toLowerCase());
    const matchesType = typeFilter === 'all' || p.type === typeFilter;
    return matchesSearch && matchesType;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 w-full relative">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Persona Library</h1>
        <p className="text-gray-500">Discover public personas. Star any persona to add it to Saved Personas.</p>
      </div>

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
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 bg-gray-50 rounded-3xl border border-dashed border-gray-200">
          <Library className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No public personas yet</h3>
          <p className="text-gray-500">Public and admin-created personas will appear here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((persona) => (
            <LibraryPersonaCard
              key={persona.id}
              persona={persona}
              isStarred={starredIds.has(persona.id)}
              isTogglingStar={togglingStarId === persona.id}
              onToggleStar={() => handleToggleStar(persona)}
              onViewFiles={() => setViewingFilesPersona(persona)}
            />
          ))}
        </div>
      )}

      {viewingFilesPersona && (
        <FileViewerModal
          persona={viewingFilesPersona}
          files={personaFiles[viewingFilesPersona.id] || []}
          loadingFiles={loadingFiles[viewingFilesPersona.id]}
          onClose={() => setViewingFilesPersona(null)}
        />
      )}
    </div>
  );
};

const typeLabels: Record<string, { label: string; color: string }> = {
  synthetic_user: { label: 'Synthetic User', color: 'bg-blue-100 text-blue-700' },
  advisor: { label: 'Advisor', color: 'bg-purple-100 text-purple-700' },
};

const LibraryPersonaCard: React.FC<{
  persona: Persona;
  isStarred: boolean;
  isTogglingStar: boolean;
  onToggleStar: () => void;
  onViewFiles: () => void;
}> = ({ persona, isStarred, isTogglingStar, onToggleStar, onViewFiles }) => {
  const navigate = useNavigate();
  const avatarUrl = persona.avatarUrl || persona.avatar_url;
  const createdAt = persona.createdAt || persona.created_at;

  return (
    <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden group hover:shadow-xl transition-all flex flex-col h-full">
      <div className="relative h-48 bg-gray-100 flex items-center justify-center overflow-hidden">
        <img
          src={avatarUrl}
          alt={getPersonaDisplayName(persona)}
          className="w-full h-full object-cover transition-transform group-hover:scale-105"
        />
        <div className="absolute top-4 right-4 flex gap-2 z-10">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleStar(); }}
            disabled={isTogglingStar}
            className={`p-2 rounded-lg transition-colors shadow-sm cursor-pointer ${
              isStarred ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'bg-white/80 backdrop-blur text-gray-400 hover:bg-white hover:text-amber-600'
            }`}
            title={isStarred ? 'Remove from Saved Personas' : 'Add to Saved Personas'}
          >
            {isTogglingStar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Star className={`w-4 h-4 ${isStarred ? 'fill-current' : ''}`} />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onViewFiles(); }}
            className="p-2 bg-white/80 backdrop-blur rounded-lg text-indigo-600 hover:bg-white transition-colors shadow-sm cursor-pointer"
            title="View Blueprint Files"
          >
            <FileText className="w-4 h-4" />
          </button>
        </div>
        <div className="absolute bottom-4 left-4">
          <span className={`px-3 py-1 rounded-full text-xs font-bold shadow-sm ${typeLabels[persona.type]?.color || 'bg-gray-100 text-gray-700'}`}>
            {typeLabels[persona.type]?.label || persona.type}
          </span>
        </div>
      </div>
      <div className="p-6 flex-grow flex flex-col">
        <h3 className="text-xl font-bold text-gray-900 mb-2">{getPersonaDisplayName(persona)}</h3>
        <p className="text-gray-500 text-sm mb-4 line-clamp-2">{persona.description}</p>
        <div className="flex items-center text-xs text-gray-400 mb-6">
          {createdAt ? new Date(createdAt).toLocaleDateString() : 'N/A'}
        </div>
        <div className="grid grid-cols-2 gap-2 mt-auto">
          <button
            onClick={onViewFiles}
            className="py-3 bg-gray-50 text-gray-700 rounded-xl font-bold hover:bg-gray-100 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <FileText className="w-4 h-4" /> Files
          </button>
          <button
            onClick={() => navigate(`/chat?personaId=${persona.id}`)}
            className="py-3 bg-indigo-50 text-indigo-700 rounded-xl font-bold hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-2 cursor-pointer"
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
  const avatarUrl = persona.avatarUrl || persona.avatar_url;

  React.useEffect(() => {
    if (files.length > 0 && !selectedFile) setSelectedFile(files[0]);
  }, [files]);

  const handleDownload = () => {
    if (!selectedFile) return;
    const blob = new Blob([selectedFile.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = selectedFile.name.endsWith('.md') ? selectedFile.name : `${selectedFile.name}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-gray-900/60 backdrop-blur-md" onClick={onClose} />
      <div className="relative bg-white w-full max-w-5xl h-[85vh] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col md:flex-row">
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
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 text-indigo-600 animate-spin" /></div>
            ) : files.length > 0 ? (
              files.map((file) => (
                <button
                  key={file.id}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-left p-4 rounded-2xl flex items-center justify-between transition-all cursor-pointer ${
                    selectedFile?.id === file.id ? 'bg-white shadow-lg shadow-gray-200/50 text-indigo-600 border border-gray-100' : 'text-gray-600 hover:bg-white hover:shadow-sm'
                  }`}
                >
                  <span className="text-sm font-bold truncate">{file.name}</span>
                </button>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500 text-sm">No files available</div>
            )}
          </div>
          <div className="p-6 bg-white border-t border-gray-100">
            <button onClick={onClose} className="w-full py-4 bg-gray-100 text-gray-600 rounded-2xl font-bold hover:bg-gray-200 transition-all">
              Close
            </button>
          </div>
        </aside>
        <main className="flex-grow flex flex-col bg-white overflow-hidden relative p-10">
          <button onClick={onClose} className="absolute top-6 right-6 z-10 p-3 bg-gray-100 text-gray-400 rounded-2xl hover:bg-gray-200">×</button>
          {selectedFile ? (
            <>
              <header className="pb-6 border-b border-gray-50 flex justify-between items-center">
                <h2 className="text-2xl font-black text-gray-900">{selectedFile.name}</h2>
                <button onClick={handleDownload} className="hidden sm:flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-xl text-sm font-bold hover:bg-indigo-100">
                  Download .md
                </button>
              </header>
              <div className="flex-grow overflow-y-auto p-10 bg-gray-50/30">
                <pre className="whitespace-pre-wrap font-sans text-gray-700 leading-relaxed text-base bg-white p-8 rounded-3xl border border-gray-100">
                  {selectedFile.content}
                </pre>
              </div>
            </>
          ) : (
            <div className="flex-grow flex items-center justify-center text-gray-500">Select a file</div>
          )}
        </main>
      </div>
    </div>
  );
};

export default PersonaLibraryPage;
