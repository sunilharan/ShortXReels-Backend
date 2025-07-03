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
router.put('/resetPassword', resetPassword );

router.use(authenticate)
router.get('/currentUser', currentUser);
router.post('/logout', logout);
router.delete('/deleteUser', deleteUser);
router.put('/updateProfile',uploadProfilePicture, validateUpdateUser, updateUser);
router.put('/changePassword', changePassword);

export default router;
