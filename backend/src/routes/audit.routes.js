import { Router } from 'express';
import { AuditService } from '../services/audit.service.js';
import { authenticateUser } from '../middleware/auth.js';

const router = Router();

router.use(authenticateUser);

router.get('/events', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '50', 10);
    const offset = parseInt(req.query.offset || '0', 10);
    const events = await AuditService.getUserEvents(req.user.id, limit, offset);
    res.json({ events });
  } catch (error) {
    next(error);
  }
});

export default router;
