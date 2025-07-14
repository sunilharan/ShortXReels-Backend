import { Router } from 'express';
import { adminOnly, authenticate } from '../middlewares/auth.middleware';
import {
  createReport,
  deleteReport,
  getReports,
  validateReport,
} from '../controllers/report.controller';

const router = Router();

router.use(authenticate);
router.get('/', getReports);
router.post('/', createReport);
router.delete('/:id', deleteReport);
router.post('/validate', adminOnly, validateReport);

export default router;
