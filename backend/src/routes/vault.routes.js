import { Router } from 'express';
import {
  VaultController,
  createCredentialSchema,
  verifyFaceSchema,
  releaseSchema,
} from '../controllers/vault.controller.js';
import { authenticateUser, authenticateFlexible } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

// Vault CRUD
router.get('/', authenticateUser, VaultController.listCredentials);
router.post('/', authenticateUser, validate(createCredentialSchema), VaultController.createCredential);
router.delete('/:id', authenticateUser, VaultController.deleteCredential);

// Progressive Authorization Pipeline (Flexible: web user or paired extension)
router.post('/:id/initiate-access', authenticateFlexible, VaultController.initiateAccess);
router.post('/:id/verify-face', authenticateFlexible, validate(verifyFaceSchema), VaultController.verifyFace);
router.get('/:id/passkey-options', authenticateFlexible, VaultController.getPasskeyOptions);
router.post('/:id/verify-passkey', authenticateFlexible, VaultController.verifyPasskey);
router.post('/:id/release', authenticateFlexible, validate(releaseSchema), VaultController.releaseCredential);

export default router;
