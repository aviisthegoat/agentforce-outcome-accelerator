import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.js';
import * as aiProxyService from '../services/aiProxyService.js';

export async function generateBasic(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { prompt, isJson } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    const result = await aiProxyService.generateBasic(prompt, Boolean(isJson));
    res.json({ result });
  } catch (error) {
    next(error);
  }
}

export async function generateChain(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { templateContent, inputs, temperature } = req.body;
    if (!templateContent) return res.status(400).json({ error: 'templateContent is required' });
    const result = await aiProxyService.generateChain(templateContent, inputs || {}, temperature);
    res.json({ result });
  } catch (error) {
    next(error);
  }
}

export async function extractFacts(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { sourceData } = req.body;
    if (!sourceData) return res.status(400).json({ error: 'sourceData is required' });
    const result = await aiProxyService.extractFacts(sourceData);
    res.json({ result });
  } catch (error) {
    next(error);
  }
}

export async function runSimulation(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { prompt, imageData, mimeType } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    const result = await aiProxyService.runSimulation(prompt, imageData, mimeType);
    res.json({ result });
  } catch (error) {
    next(error);
  }
}

export async function generatePersonaName(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const { context, excludedNames } = req.body;
    if (!context) return res.status(400).json({ error: 'context is required' });
    const result = await aiProxyService.generatePersonaName(context, Array.isArray(excludedNames) ? excludedNames : []);
    res.json({ result });
  } catch (error) {
    next(error);
  }
}
