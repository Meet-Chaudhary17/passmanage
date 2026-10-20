import { Router } from 'express';
import { AuthController, registerSchema, loginSchema } from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticateUser } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), AuthController.register);
router.post('/login', authLimiter, validate(loginSchema), AuthController.login);
router.get('/me', authenticateUser, AuthController.me);

export default router;
