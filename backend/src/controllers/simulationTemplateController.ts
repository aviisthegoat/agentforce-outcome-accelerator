import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import * as simulationTemplateService from '../services/simulationTemplateService.js';
import { CreateSimulationRequest, UpdateSimulationRequest } from '../types/index.js';

// Public endpoint - get active simulations
export async function getActiveSimulations(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const simulations = await simulationTemplateService.getAllSimulations(false);
    res.json(simulations);
  } catch (error: any) {
    console.error('Error fetching active simulations:', error);
    console.error('Error stack:', error.stack);
    // Provide more detailed error information
    if (error.code === '42P01') {
      // Table doesn't exist
      console.error('Simulations table does not exist. Please run database migrations.');
      return res.status(500).json({ 
        error: 'Database table not found. Please ensure migrations have been run.',
        details: error.message 
      });
    }
    // Log the full error for debugging
    console.error('Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    next(error);
  }
}

// Admin endpoint - get all simulations (including inactive)
export async function getAllSimulations(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    const simulations = await simulationTemplateService.getAllSimulations(includeInactive);
    res.json(simulations);
  } catch (error) {
    next(error);
  }
}

export async function getSimulationById(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const simulation = await simulationTemplateService.getSimulationById(id);
    
    if (!simulation) {
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    res.json(simulation);
  } catch (error) {
    next(error);
  }
}

export async function createSimulation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const data: CreateSimulationRequest = req.body;
    
    if (!data.title?.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }
    if (data.simulation_type) {
      if (!data.description?.trim()) {
        return res.status(400).json({ error: 'Description (what this simulation is) is required when using simulation type' });
      }
    } else if (!data.system_prompt?.trim()) {
      return res.status(400).json({ error: 'Either system_prompt or simulation_type with description is required' });
    }

    const simulation = await simulationTemplateService.createSimulation(data);
    res.status(201).json(simulation);
  } catch (error) {
    next(error);
  }
}

export async function previewSystemPrompt(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const data: CreateSimulationRequest = req.body;
    const systemPrompt = simulationTemplateService.buildSystemPromptFromConfig(data);
    res.json({ system_prompt: systemPrompt });
  } catch (error) {
    next(error);
  }
}

export async function updateSimulation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data: UpdateSimulationRequest = req.body;
    
    const simulation = await simulationTemplateService.updateSimulation(id, data);
    
    if (!simulation) {
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    res.json(simulation);
  } catch (error) {
    next(error);
  }
}

export async function deleteSimulation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const deleted = await simulationTemplateService.deleteSimulation(id);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Simulation not found' });
    }
    
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

