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
  adminGetUsers,
} from '../controllers/user.controller';
import { adminOnly, authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.post('/login', loginAdmin);
router.use(authenticate);

router.use(adminOnly);
router.post('/register', validateRegister, adminRegister);
router.get('/', adminGetUsers);
router.put('/', validateUpdateUser, adminEdit);
router.delete('/:id', adminDelete);

export default router;
