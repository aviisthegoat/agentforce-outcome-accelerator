import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as simulationController from '../controllers/simulationController.js';
import * as simulationTemplateController from '../controllers/simulationTemplateController.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// IMPORTANT: Specific routes must come before parameterized routes
router.get('/templates', simulationTemplateController.getActiveSimulations);
router.get('/', simulationController.getSimulationSessions);
router.get('/:id', simulationController.getSimulationSession);
router.get('/:id/persuasion-context', simulationController.getPersuasionContext);
router.post('/', simulationController.createSimulationSession);
router.post('/:id/messages', simulationController.createSimulationMessage);
router.post('/:id/messages/bulk', simulationController.createSimulationMessagesBulk);
router.put('/:id', simulationController.updateSimulationSession);
router.delete('/:id', simulationController.deleteSimulationSession);

export default router;

