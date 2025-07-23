import { Router } from 'express';
import {
  validateRegister,
  validateUpdateUser,
} from '../middlewares/user.middleware';
import {
  loginAdmin,
  adminRegister,
  adminEdit,
  adminDelete,
  adminGetAppUsers,
  adminGetAdminUsers,
} from '../controllers/user.controller';
import { getReports } from '../controllers/report.controller';

import {
  adminOnly,
  authenticate,
  superAdminOnly,
} from '../middlewares/auth.middleware';
import { uploadFiles } from '../middlewares/upload.middleware';

const router = Router();

router.post('/login', loginAdmin);

router.use(authenticate);
router.use(adminOnly);
router.get('/users', adminGetAppUsers);
router.get('/reports', getReports);

router.use(superAdminOnly);
router.get('/admins', adminGetAdminUsers);
router.post(
  '/register',
  uploadFiles({
    profile: { maxCount: 1, types: ['image'] },
  }),
  validateRegister,
  adminRegister
);
router.put(
  '/',
  uploadFiles({
    profile: { maxCount: 1, types: ['image'] },
  }),
  validateUpdateUser,
  adminEdit
);
router.delete('/:id', adminDelete);

export default router;
