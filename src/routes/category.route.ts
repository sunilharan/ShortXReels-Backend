import { Router } from 'express';
import { adminOnly, authenticate } from '../middlewares/auth.middleware';
import { uploadCategory } from '../middlewares/upload.middleware';
import { createCategory, deleteCategory, getCategories, editCategory } from '../controllers/category.controller';

const router = Router();


router.get('/', getCategories);
router.use(authenticate);
router.use(adminOnly);
router.post('/', uploadCategory, createCategory);
router.delete('/:id', deleteCategory);
router.put('/', uploadCategory, editCategory);

export default router;
