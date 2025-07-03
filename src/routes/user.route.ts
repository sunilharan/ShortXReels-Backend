import { Router } from 'express';
import { validateRegister, validateUpdateUser } from '../middlewares/user.middleware';
import { register, login, refreshToken, currentUser, logout, deleteUser, updateUser, sendOtp, verifyOtp,resetPassword, changePassword } from '../controllers/user.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { uploadProfilePicture } from '../middlewares/upload.middleware';            

const router = Router();

router.post('/register', validateRegister, register);
router.post('/login', login);
router.post('/refreshToken', refreshToken);
router.post('/forgotPassword', sendOtp);
router.post('/verifyOtp', verifyOtp);
router.post('/resetPassword', resetPassword );

router.use(authenticate)
router.get('/currentUser', currentUser);
router.post('/logout', logout);
router.delete('/deleteUser', deleteUser);
router.patch('/updateProfile',uploadProfilePicture, validateUpdateUser, updateUser);
router.patch('/changePassword', changePassword);

export default router;
