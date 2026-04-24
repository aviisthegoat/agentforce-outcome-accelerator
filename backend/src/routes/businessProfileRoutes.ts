import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as businessProfileController from '../controllers/businessProfileController.js';

const router = Router();

router.use(authenticateToken);

router.get('/', businessProfileController.getBusinessProfile);
router.put('/', businessProfileController.upsertBusinessProfile);

export default router;
