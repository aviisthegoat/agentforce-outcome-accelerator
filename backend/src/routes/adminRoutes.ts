import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/adminAuth.js';
import * as adminController from '../controllers/adminController.js';
import * as simulationTemplateController from '../controllers/simulationTemplateController.js';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticateToken);
router.use(requireAdmin);

// Admin data endpoints
router.get('/users', adminController.getUsers);
router.get('/personas', adminController.getPersonas);
router.get('/chats', adminController.getChatSessions);
router.get('/messages', adminController.getMessages);
router.get('/stats', adminController.getStats);
router.post('/personas', adminController.createPersona);
router.post('/reindex-all', adminController.reindexAll);
router.get('/test-embed', adminController.testEmbed);

// Simulation template management (admin only)
router.get('/simulations', simulationTemplateController.getAllSimulations);
router.post('/simulations/preview-prompt', simulationTemplateController.previewSystemPrompt);
router.get('/simulations/:id', simulationTemplateController.getSimulationById);
router.post('/simulations', simulationTemplateController.createSimulation);
router.put('/simulations/:id', simulationTemplateController.updateSimulation);
router.delete('/simulations/:id', simulationTemplateController.deleteSimulation);

export default router;


