import { Router } from 'express';
import {
  VerificationController,
  sessionFaceSchema,
} from '../controllers/verification.controller.js';
import { authenticateUser } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticateUser);

router.get('/:sessionId', VerificationController.getSession);
router.post('/:sessionId/face', validate(sessionFaceSchema), VerificationController.verifySessionFace);
router.get('/:sessionId/passkey-options', VerificationController.getSessionPasskeyOptions);
router.post('/:sessionId/passkey', VerificationController.verifySessionPasskey);

export default router;
