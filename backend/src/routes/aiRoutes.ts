import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as aiController from '../controllers/aiController.js';

const router = Router();

router.use(authenticateToken);

router.post('/generate-basic', aiController.generateBasic);
router.post('/generate-chain', aiController.generateChain);
router.post('/extract-facts', aiController.extractFacts);
router.post('/run-simulation', aiController.runSimulation);
router.post('/generate-persona-name', aiController.generatePersonaName);

export default router;
