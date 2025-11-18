import express from 'express';
import { auth } from '../middleware/authMiddleware.js';
import * as sessionController from '../controllers/userController.js';

const router = express.Router();

router.post('/start', auth, sessionController.start);
router.post('/end', auth, sessionController.end);
router.get('/active', auth, sessionController.active);
router.get('/logs', auth, sessionController.logs);

export default router;
