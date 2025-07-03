import { Router } from 'express';
import { adminOnly, authenticate } from '../middlewares/auth.middleware';
import {
  createReport,
  deleteReport,
  getReports,
  editReport,
  validateReport,
} from '../controllers/report.controller';

const router = Router();

router.use(authenticate);
router.get('/get', getReports);
router.post('/create', createReport);
router.delete('/delete/:id', deleteReport);
router.patch('/edit', editReport);
router.post('/validate', adminOnly, validateReport);

export default router;
