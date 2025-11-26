import express from 'express';
import { auth, adminOnly } from '../middleware/authMiddleware.js';
import { getTracked, setTracked } from '../controllers/teamleadController.js';
import { getAllTracked } from '../controllers/teamleadController.js';

const router = express.Router();

// get tracked users for current teamlead
router.get('/tracked', auth, async (req, res) => {
  // allow only teamleads or admins
  if (!req.user || (req.user.role !== 'teamlead' && req.user.role !== 'admin'))
    return res.status(403).json({ message: 'TeamLead only' });
  return getTracked(req, res);
});

router.post('/tracked', auth, async (req, res) => {
  if (!req.user || (req.user.role !== 'teamlead' && req.user.role !== 'admin'))
    return res.status(403).json({ message: 'TeamLead only' });
  return setTracked(req, res);
});

// admin-only: get all teamlead -> tracked mappings
router.get('/all-tracked', auth, adminOnly, async (req, res) => {
  return getAllTracked(req, res);
});

export default router;
