import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as personaController from '../controllers/personaController.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Library and starring (must be before /:id)
router.get('/library', personaController.getLibraryPersonas);
router.get('/starred', personaController.getStarredPersonas);
router.get('/available', personaController.getAvailablePersonas);
router.post('/:id/star', personaController.starPersona);
router.delete('/:id/star', personaController.unstarPersona);

router.get('/', personaController.getPersonas);
router.get('/:id', personaController.getPersona);
router.post('/', personaController.createPersona);
router.put('/:id', personaController.updatePersona);
router.delete('/:id', personaController.deletePersona);

// Persona files routes
router.get('/:personaId/files', personaController.getPersonaFiles);
router.post('/:personaId/files', personaController.createPersonaFile);

export default router;


