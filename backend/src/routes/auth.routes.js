import { Router } from 'express';
import {
  AuthController,
  registerSchema,
  verifyOtpSchema,
  resendOtpSchema,
  loginSchema,
} from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { authenticateUser } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

// Step 1: Initiate registration and send email OTP
router.post('/register', authLimiter, validate(registerSchema), AuthController.requestOtp);
router.post('/register-request', authLimiter, validate(registerSchema), AuthController.requestOtp);

// Step 2: Verify OTP and create vault user account
router.post('/register-verify', authLimiter, validate(verifyOtpSchema), AuthController.verifyOtp);
router.post('/verify-otp', authLimiter, validate(verifyOtpSchema), AuthController.verifyOtp);

// Resend OTP
router.post('/resend-otp', authLimiter, validate(resendOtpSchema), AuthController.resendOtp);

// Login and Me
router.post('/login', authLimiter, validate(loginSchema), AuthController.login);
router.get('/me', authenticateUser, AuthController.me);

export default router;
