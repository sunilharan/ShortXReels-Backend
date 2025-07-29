import { Router } from 'express';
import { adminOnly, authenticate } from '../middlewares/auth.middleware';
import {
  createReport,
  deleteReport,
  getReports,
  validateReport,
  getReportedUsers,
  getReportsByUser
} from '../controllers/report.controller';

const router = Router();

router.use(authenticate);
router.post('/', createReport);
router.use(adminOnly);
router.delete('/:id', deleteReport);
router.get('/', getReports);
router.post('/acceptReject', validateReport);
router.get('/users', getReportedUsers);
router.get('/byUserId', getReportsByUser);
export default router;
