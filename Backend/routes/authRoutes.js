import express from 'express';
import { auth, adminOnly, teamleadOnly } from '../middleware/authMiddleware.js';
import * as authController from '../controllers/authController.js';

const router = express.Router();

// public
router.post('/login', authController.login);

// admin-only
router.post('/add-user', auth, adminOnly, authController.addUser);
router.get('/users', auth, adminOnly, authController.listUsers);
router.put('/user/:id', auth, adminOnly, authController.updateUser);
router.delete('/user/:id', auth, adminOnly, authController.deleteUser);

// authenticated
router.get('/me', auth, authController.me);

// find user by employeeId (authenticated - used by teamleads to lookup employees)
router.get('/user-by-employee', auth, authController.findByEmployeeId);

export default router;
