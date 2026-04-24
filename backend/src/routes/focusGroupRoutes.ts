import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as focusGroupController from '../controllers/focusGroupController.js';

const router = Router();
router.use(authenticateToken);

router.get('/', focusGroupController.listFocusGroups);
router.get('/:id', focusGroupController.getFocusGroup);
router.post('/', focusGroupController.createFocusGroup);
router.put('/:id', focusGroupController.updateFocusGroup);
router.delete('/:id', focusGroupController.deleteFocusGroup);

export default router;
