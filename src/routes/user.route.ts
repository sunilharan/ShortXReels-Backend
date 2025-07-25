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
  deleteUser,
  updateUser,
  sendOtp,
  verifyOtp,
  resetPassword,
  changePassword,
  nameExist,
  getSavedReels,
  saveUnsaveReel,
} from '../controllers/user.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { uploadFiles } from '../middlewares/upload.middleware';

const router = Router();

router.post('/register', validateRegister, register);
router.get('/nameExist/:name', nameExist);
router.post('/login', login);
router.post('/refreshToken', refreshToken);
router.post('/forgotPassword', sendOtp);
router.post('/verifyOtp', verifyOtp);
router.put('/resetPassword', resetPassword);

router.use(authenticate);
router.get('/currentUser', currentUser);
router.post('/logout', logout);
router.delete('/deleteUser', deleteUser);
router.put(
  '/updateProfile',
  uploadFiles({
    profile: { maxCount: 1, types: ['image'] },
  }),
  validateUpdateUser,
  updateUser
);
router.put('/changePassword', changePassword);
router.get('/getSavedReels', getSavedReels);
router.post('/saveUnsaveReel', saveUnsaveReel);
export default router;
