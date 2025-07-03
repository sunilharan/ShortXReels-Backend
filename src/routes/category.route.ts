import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { uploadCategoryImageFile } from '../middlewares/upload.middleware';
import { createCategory, deleteCategory, getCategories, editCategory } from '../controllers/category.controller';

const router = Router();

router.use(authenticate);

router.get('/get', getCategories);
router.post('/create', uploadCategoryImageFile, createCategory);
router.delete('/delete/:id', deleteCategory);
router.patch('/edit', uploadCategoryImageFile, editCategory);

export default router;
