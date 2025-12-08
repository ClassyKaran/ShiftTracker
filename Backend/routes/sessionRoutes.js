import express from 'express';
import { auth, adminOnly } from '../middleware/authMiddleware.js';
import * as sessionController from '../controllers/userController.js';

const router = express.Router();

router.post('/start', auth, sessionController.start);
router.post('/end', auth, sessionController.end);
router.post('/activity', auth, sessionController.activity);
// endpoint to support sendBeacon/keepalive where Authorization header may not be present
router.post('/end-beacon', sessionController.endBeacon);
router.get('/active', auth, sessionController.active);
router.get('/logs', auth, sessionController.logs);
router.get('/stats', auth, adminOnly, sessionController.stats);
router.get('/alerts', auth, adminOnly, sessionController.alerts);
router.get('/export', auth, adminOnly, sessionController.exportLogs);
router.post('/cleanup', auth, adminOnly, sessionController.cleanup);

export default router;
