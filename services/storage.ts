
import { Persona, ChatSession, Message, SimulationSession } from '../types';

const DB_NAME = 'PersonaBuilderDB';
const DB_VERSION = 2;
const STORES = {
  PERSONAS: 'personas',
  SESSIONS: 'sessions',
  MESSAGES: 'messages',
  SIMULATIONS: 'simulation_sessions',
};

const SEED_KEY = 'spb_initial_seed_done';

const INITIAL_PERSONAS: Persona[] = [
  {
    id: 'seed-elena-rodriguez',
    name: 'Elena Rodriguez',
    type: 'synthetic_user',
    description: 'Senior Product Manager @ Fintech Startup',
    avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=256&h=256&auto=format&fit=crop',
    createdAt: new Date().toISOString(),
    metadata: { personaGroupId: 'seed-group' },
    files: [
      {
        id: 'f-elena-2',
        name: 'Job_Builder.md',
        type: 'markdown',
        content: '## Job Architecture\n1. **Identify**: Compare rates across providers.\n2. **Validate**: Ensure destination account is active.\n3. **Transfer**: Authorize secure payment.'
      }
    ]
  },
  {
    id: 'seed-alex-vance',
    name: 'Alex Vance',
    type: 'synthetic_user',
    description: 'Eco-Conscious Urban Commuter',
    avatarUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=256&h=256&auto=format&fit=crop',
    createdAt: new Date().toISOString(),
    metadata: { personaGroupId: 'seed-group' },
    files: [
      {
        id: 'f-alex-1',
        name: 'Sustainability_Profile.md',
        type: 'markdown',
        content: '# User Profile: Alex Vance\n\n**Identity:** Urban dweller, car-free, tech-dependent.\n**Core Job:** Optimizing multi-modal travel routes for carbon footprint.\n**Decision Logic:** Prioritizes bike-share availability over cost.'
      }
    ]
  },
  {
    id: 'seed-andrea-ridi',
    name: 'Andrea Ridi',
    type: 'advisor',
    description: 'CEO @ CleanTech Solutions',
    avatarUrl: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?q=80&w=256&h=256&auto=format&fit=crop',
    createdAt: new Date().toISOString(),
    metadata: { personaGroupId: 'seed-group' },
    files: [
      {
        id: 'f-andrea-1',
        name: 'Executive_Dossier.md',
        type: 'markdown',
        content: '# Advisor: Andrea Ridi\n\n**Roleplay Focus:** Strategic partnerships and unit economics.\n**Personality:** Fast-paced, outcome-oriented, values transparency.\n**Interviewer Style:** Probes deeply into "hidden" costs of implementation.'
      }
    ]
  },
  {
    id: 'seed-eric-ries',
    name: 'Eric Ries',
    type: 'advisor',
    description: 'Lean Startup Architect & Author',
    avatarUrl: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?q=80&w=256&h=256&auto=format&fit=crop',
    createdAt: new Date().toISOString(),
    metadata: { personaGroupId: 'seed-group' },
    files: [
      {
        id: 'f-eric-1',
        name: 'Lean_Methodology_Blueprint.md',
        type: 'markdown',
        content: '# Advisor Blueprint: Eric Ries\n\n**Philosophy:** Relentless focus on Build-Measure-Learn.\n**Methodology:** Validated learning over vanity metrics.\n**Advisory Tone:** Disciplined, rigorous, and hypothesis-driven.'
      }
    ]
  },
  {
    id: 'seed-sarah-chen',
    name: 'Sarah Chen',
    type: 'synthetic_user',
    description: 'Freelance Creative Director',
    avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=256&h=256&auto=format&fit=crop',
    createdAt: new Date().toISOString(),
    metadata: { personaGroupId: 'seed-group' },
    files: [
      {
        id: 'f-sarah-c-1',
        name: 'Creative_Workflow.md',
        type: 'markdown',
        content: '# Creative Persona: Sarah Chen\n\n**Core Job:** Juggling diverse client aesthetics while maintaining a unique voice.\n**Pain Point:** Tool fatigue from switching between feedback apps.\n**Social Goal:** Being seen as an "essential" creative partner, not a commodity.'
      }
    ]
  },
  {
    id: 'seed-sarah-miller',
    name: 'Dr. Sarah Miller',
    type: 'synthetic_user',
    description: 'Principal Researcher in Biotech',
    avatarUrl: 'https://images.unsplash.com/photo-1559839734-2b71f1536783?q=80&w=256&h=256&auto=format&fit=crop',
    createdAt: new Date().toISOString(),
    metadata: { personaGroupId: 'seed-group' },
    files: [
      {
        id: 'f-sarah-m-1',
        name: 'Research_Persona_Detail.md',
        type: 'markdown',
        content: '# Research Profile: Dr. Miller\n\n**Context:** Advanced genomic sequencing workflows.\n**Functional Job:** Reducing "noise" in data analysis pipelines.\n**Emotional Driver:** Absolute confidence in reproducibility of results.'
      }
    ]
  },
  {
    id: 'seed-marcus-thorne',
    name: 'Marcus Thorne',
    type: 'synthetic_user',
    description: 'Enterprise IT Director @ GlobalCorp',
    avatarUrl: 'https://images.unsplash.com/photo-1560250097-0b93528c311a?q=80&w=256&h=256&auto=format&fit=crop',
    createdAt: new Date().toISOString(),
    metadata: { personaGroupId: 'seed-group' },
    files: [
      {
        id: 'f-marcus-1',
        name: 'IT_Director_Blueprint.md',
        type: 'markdown',
        content: '# Enterprise Persona: Marcus Thorne\n\n**Primary Constraint:** Compliance and security above all else.\n**Decision Trigger:** Proof of seamless integration with legacy systems.\n**Anxiety:** Operational downtime during system migrations.'
      }
    ]
  }
];

class DBManager {
  private db: IDBDatabase | null = null;

  async open(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORES.PERSONAS)) {
          db.createObjectStore(STORES.PERSONAS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
          db.createObjectStore(STORES.SESSIONS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.MESSAGES)) {
          const messageStore = db.createObjectStore(STORES.MESSAGES, { keyPath: 'id' });
          messageStore.createIndex('sessionId', 'sessionId', { unique: false });
        }
        if (!db.objectStoreNames.contains(STORES.SIMULATIONS)) {
          db.createObjectStore(STORES.SIMULATIONS, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getAll<T>(storeName: string): Promise<T[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async put<T>(storeName: string, item: T): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(item);
      request.onsuccess = () => resolve(item);
      request.onerror = () => reject(request.error);
    });
  }

  async delete(storeName: string, id: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(id);
      
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      request.onerror = () => reject(request.error);
    });
  }

  async clearStore(storeName: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async getMessagesBySession(sessionId: string): Promise<Message[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORES.MESSAGES, 'readonly');
      const store = transaction.objectStore(STORES.MESSAGES);
      const index = store.index('sessionId');
      const request = index.getAll(sessionId);
      request.onsuccess = () => {
        const results = request.result as Message[];
        resolve(results.sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      };
      request.onerror = () => reject(request.error);
    });
  }
}

const db = new DBManager();

export const storageService = {
  getPersonas: async (): Promise<Persona[]> => {
    const personas = await db.getAll<Persona>(STORES.PERSONAS);
    const hasBeenSeeded = localStorage.getItem(SEED_KEY);

    if (personas.length === 0 && !hasBeenSeeded) {
      // Seed initial data ONLY if it's the very first time and db is empty
      console.log("Seeding initial personas...");
      for (const persona of INITIAL_PERSONAS) {
        await db.put(STORES.PERSONAS, persona);
      }
      localStorage.setItem(SEED_KEY, 'true');
      return INITIAL_PERSONAS;
    }
    return personas;
  },

  savePersona: async (persona: Persona) => {
    return db.put(STORES.PERSONAS, persona);
  },

  deletePersona: async (id: string) => {
    console.log(`Deleting persona ${id} from IndexedDB...`);
    return db.delete(STORES.PERSONAS, id);
  },

  getSessions: async (): Promise<ChatSession[]> => {
    return db.getAll<ChatSession>(STORES.SESSIONS);
  },

  saveSession: async (session: ChatSession) => {
    return db.put(STORES.SESSIONS, session);
  },

  getMessages: async (sessionId: string): Promise<Message[]> => {
    return db.getMessagesBySession(sessionId);
  },

  saveMessage: async (message: Message) => {
    return db.put(STORES.MESSAGES, message);
  },

  getSimulationSessions: async (): Promise<SimulationSession[]> => {
    return db.getAll<SimulationSession>(STORES.SIMULATIONS);
  },

  saveSimulationSession: async (session: SimulationSession) => {
    return db.put(STORES.SIMULATIONS, session);
  },

  deleteSimulationSession: async (id: string) => {
    return db.delete(STORES.SIMULATIONS, id);
  },

  clearAllData: async () => {
    await db.clearStore(STORES.PERSONAS);
    await db.clearStore(STORES.SESSIONS);
    await db.clearStore(STORES.MESSAGES);
    await db.clearStore(STORES.SIMULATIONS);
    localStorage.removeItem(SEED_KEY);
  }
};
