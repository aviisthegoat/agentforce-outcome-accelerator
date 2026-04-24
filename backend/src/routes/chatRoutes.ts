import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import * as chatController from '../controllers/chatController.js';

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Chat sessions
router.get('/sessions', chatController.getChatSessions);
router.get('/sessions/:id', chatController.getChatSession);
router.post('/sessions', chatController.createChatSession);
router.put('/sessions/:id', chatController.updateChatSession);
router.delete('/sessions/:id', chatController.deleteChatSession);

// Session personas
router.get('/sessions/:sessionId/personas', chatController.getSessionPersonas);

// Messages
router.get('/sessions/:sessionId/messages', chatController.getMessages);
router.post('/sessions/:sessionId/messages', chatController.createMessage);
router.delete('/sessions/:sessionId/messages/:messageId', chatController.deleteMessage);

export default router;

