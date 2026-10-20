import { Router } from 'express';
import { OnboardingController, faceEnrollSchema } from '../controllers/onboarding.controller.js';
import { authenticateUser } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

router.use(authenticateUser);

router.post('/face-enroll', validate(faceEnrollSchema), OnboardingController.enrollFace);
router.post('/webauthn/register-options', OnboardingController.getWebAuthnRegisterOptions);
router.post('/webauthn/verify-registration', OnboardingController.verifyWebAuthnRegistration);
router.post('/complete', OnboardingController.completeOnboarding);

export default router;
