import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import * as personaService from '../services/personaService.js';
import { Persona, PersonaFile, PersonaVisibility } from '../types/index.js';

export async function getPersonas(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const personas = await personaService.getPersonasByUserId(req.userId!);
    res.json(personas);
  } catch (error) {
    next(error);
  }
}

export async function getPersona(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const persona = await personaService.getPersonaById(id, req.userId!);
    
    if (!persona) {
      return res.status(404).json({ error: 'Persona not found' });
    }
    
    res.json(persona);
  } catch (error) {
    next(error);
  }
}

export async function createPersona(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const personaData: Omit<Persona, 'id' | 'user_id' | 'created_at' | 'updated_at'> = req.body;
    
    // Validate required fields
    if (!personaData.name || !personaData.name.trim()) {
      return res.status(400).json({ error: 'Name is required and cannot be empty' });
    }
    if (!personaData.type) {
      return res.status(400).json({ error: 'Type is required' });
    }
    if (!personaData.description || !personaData.description.trim()) {
      return res.status(400).json({ error: 'Description is required and cannot be empty' });
    }

    // Ensure avatar_url has a default value if not provided; restrict visibility to private/public for non-admin
    const visibility = personaData.visibility === 'public' ? 'public' : 'private';
    const sanitizedData = {
      ...personaData,
      name: personaData.name.trim(),
      description: personaData.description.trim(),
      avatar_url: personaData.avatar_url || '',
      visibility: visibility as PersonaVisibility,
    };

    const persona = await personaService.createPersona(req.userId!, sanitizedData);
    
    // Verify the created persona has all required fields
    if (!persona.id) {
      return res.status(500).json({ error: 'Failed to create persona: missing ID' });
    }
    if (!persona.name) {
      return res.status(500).json({ error: 'Failed to create persona: missing name' });
    }
    
    res.status(201).json(persona);
  } catch (error) {
    next(error);
  }
}

export async function updatePersona(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const updates: Partial<Persona> = req.body;
    
    const persona = await personaService.updatePersona(id, req.userId!, updates);
    
    if (!persona) {
      return res.status(404).json({ error: 'Persona not found' });
    }
    
    res.json(persona);
  } catch (error) {
    next(error);
  }
}

export async function deletePersona(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const deleted = await personaService.deletePersona(id, req.userId!);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Persona not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function getPersonaFiles(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { personaId } = req.params;
    const files = await personaService.getPersonaFiles(personaId, req.userId!);
    res.json(files);
  } catch (error) {
    next(error);
  }
}

export async function createPersonaFile(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { personaId } = req.params;
    const fileData: Omit<PersonaFile, 'id' | 'persona_id' | 'created_at'> = req.body;
    
    if (!fileData.name || !fileData.content || !fileData.type) {
      return res.status(400).json({ error: 'Name, content, and type are required' });
    }

    const file = await personaService.createPersonaFile(personaId, req.userId!, fileData);
    res.status(201).json(file);
  } catch (error: any) {
    if (error.message === 'Persona not found') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
}

export async function getLibraryPersonas(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const personas = await personaService.getPublicPersonas(req.userId!);
    res.json(personas);
  } catch (error) {
    next(error);
  }
}

export async function getStarredPersonas(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const personas = await personaService.getStarredPersonas(req.userId!);
    res.json(personas);
  } catch (error) {
    next(error);
  }
}

export async function starPersona(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await personaService.starPersona(id, req.userId!);
    res.status(204).send();
  } catch (error: any) {
    if (error.message === 'Persona not found') {
      return res.status(404).json({ error: error.message });
    }
    next(error);
  }
}

export async function unstarPersona(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    await personaService.unstarPersona(id, req.userId!);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function getAvailablePersonas(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const personas = await personaService.getPersonasAvailableForUser(req.userId!);
    res.json(personas);
  } catch (error) {
    next(error);
  }
}

