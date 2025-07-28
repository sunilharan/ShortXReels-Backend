import { Router } from 'express';
import { adminOnly, authenticate } from '../middlewares/auth.middleware';
import { uploadFiles } from '../middlewares/upload.middleware';
import {
  createCategory,
  deleteCategory,
  getCategories,
  editCategory,
  getActiveCategories,
  statusChange,
} from '../controllers/category.controller';

const router = Router();

router.get('/active', getActiveCategories);
router.use(authenticate);
router.use(adminOnly);
router.post(
  '/',
  uploadFiles({
    image: { maxCount: 1, types: ['image'] },
  }),
  createCategory
);
router.put(
  '/',
  uploadFiles({
    image: { maxCount: 1, types: ['image'] },
  }),
  editCategory
);
router.get('/', getCategories);
router.delete('/:id', deleteCategory);
router.post('/status', statusChange);

export default router;
