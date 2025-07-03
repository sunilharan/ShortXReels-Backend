import { Router } from 'express';
import { adminOnly, authenticate } from '../middlewares/auth.middleware';
import { uploadCategoryImageFile } from '../middlewares/upload.middleware';
import { createCategory, deleteCategory, getCategories, editCategory } from '../controllers/category.controller';

const router = Router();

router.use(authenticate);

router.get('/', getCategories);
router.use(adminOnly);
router.post('/', uploadCategoryImageFile, createCategory);
router.delete('/:id', deleteCategory);
router.put('/', uploadCategoryImageFile, editCategory);

export default router;
