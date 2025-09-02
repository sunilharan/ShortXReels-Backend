import { Router } from 'express';
import {
  validateRegister,
  validateUpdateUser,
} from '../middlewares/user.middleware';
import {
  register,
  login,
  refreshToken,
  currentUser,
  logout,
  deleteAccountWithoutReason,
  updateUser,
  sendOtp,
  verifyOtp,
  resetPassword,
  changePassword,
  nameExist,
  getSavedReels,
  saveUnsaveReel,
  statusChange,
  blockUnblockUser,
  deleteUser,
  topUsers,
  createSuperAdmin,
  deleteAccountWithReason,
} from '../controllers/user.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { uploadFiles } from '../middlewares/upload.middleware';
import { adminOnly } from '../middlewares/auth.middleware';
import { MEDIA_TYPE } from '../config/enums';

const router = Router();

router.post('/register', validateRegister, register);
router.post('/superAdmin', createSuperAdmin);
router.post('/nameExist', nameExist);
router.post('/login', login);
router.post('/refreshToken', refreshToken);
router.post('/forgotPassword', sendOtp);
router.post('/verifyOtp', verifyOtp);
router.put('/resetPassword', resetPassword);
router.post('/logout', logout);

router.use(authenticate);
router.get('/currentUser', currentUser);
router.delete('/', deleteAccountWithoutReason);
router.post('/deleteAccount', deleteAccountWithReason);
router.put(
  '/updateProfile',
  uploadFiles({
    profile: { maxCount: 1, types: [MEDIA_TYPE.image] },
  }),
  validateUpdateUser,
  updateUser
);
router.put('/changePassword', changePassword);
router.get('/getSavedReels', getSavedReels);
router.post('/saveUnsaveReel', saveUnsaveReel);
router.use(adminOnly);
router.post('/status', statusChange);
router.post('/blockUnblock', blockUnblockUser);
router.delete('/:id', deleteUser);
router.get('/topUsers', topUsers);

export default router;
