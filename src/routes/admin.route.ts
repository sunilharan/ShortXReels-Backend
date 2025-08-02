import { Router } from 'express';
import {
  validateRegister,
  validateUpdateUser,
} from '../middlewares/user.middleware';
import {
  adminLogin,
  adminRegister,
  adminEdit,
  adminDelete,
  adminGetAppUsers,
  adminGetAdminUsers,
  adminRemoveProfilePicture,
} from '../controllers/user.controller';
import {
  adminOnly,
  authenticate,
  superAdminOnly,
} from '../middlewares/auth.middleware';
import { adminDashboardDetails } from '../controllers/common.controller';
import { uploadFiles } from '../middlewares/upload.middleware';

const router = Router();

router.post('/login', adminLogin);

router.use(authenticate);
router.use(adminOnly);
router.get('/users', adminGetAppUsers);
router.get('/dashboardDetails', adminDashboardDetails);
router.delete('/removeProfilePicture/:id', adminRemoveProfilePicture);

router.use(superAdminOnly);
router.get('/', adminGetAdminUsers);
router.post(
  '/',
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
