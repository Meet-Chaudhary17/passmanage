import { Router } from 'express';
import {
  ExtensionController,
  pairChallengeSchema,
  querySchema,
} from '../controllers/extension.controller.js';
import { authenticateUser, authenticateExtension } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// Web Dashboard routes (User authenticated)
router.post('/challenge', authenticateUser, ExtensionController.generateChallenge);
router.get('/pairings', authenticateUser, ExtensionController.listPairings);
router.delete('/pairings/:id', authenticateUser, ExtensionController.revokePairing);

// Pairing exchange (Public with valid challenge code)
router.post('/pair-challenge', validate(pairChallengeSchema), ExtensionController.exchangeChallenge);

// Extension routes (Extension authenticated via dedicated extension token)
router.get('/query-credentials', authenticateExtension, validate(querySchema), ExtensionController.queryCredentials);
router.post('/request-verification', authenticateExtension, ExtensionController.createVerificationSession);
router.get('/session/:sessionId/status', authenticateExtension, ExtensionController.getVerificationSessionStatus);

export default router;
