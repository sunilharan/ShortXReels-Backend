import { Router } from 'express';
import { adminOnly, authenticate } from '../middlewares/auth.middleware';
import {
  createReport,
  deleteReport,
  getReports,
  validateReport,
  getOffenderUsers,
} from '../controllers/report.controller';

const router = Router();

router.use(authenticate);
router.post('/', createReport);
router.delete('/:id', adminOnly, deleteReport);
router.get('/', adminOnly, getReports);
router.put('/', adminOnly, validateReport);
router.get('/offenders', adminOnly, getOffenderUsers);

export default router;
