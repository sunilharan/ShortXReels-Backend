import { Router } from 'express';
import { adminOnly, authenticate } from '../middlewares/auth.middleware';
import { uploadFiles } from '../middlewares/upload.middleware';
import {
  createCategory,
  deleteCategory,
  getCategories,
  editCategory,
} from '../controllers/category.controller';

const router = Router();

router.get('/', getCategories);
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
router.delete('/:id', deleteCategory);

export default router;
