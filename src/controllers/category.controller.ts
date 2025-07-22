import expressAsyncHandler from 'express-async-handler';
import { Category } from '../models/category.model';
import { removeFile } from '../config/constants';
import { t } from 'i18next';
import { rename } from 'fs';

export const getCategories = expressAsyncHandler(async (req: any, res) => {
  try {
    const categories = await Category.find().sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error: any) {
    throw error;
  }
});

export const createCategory = expressAsyncHandler(async (req: any, res) => {
  try {
    const { name } = req.body;
    const image = req.files?.image?.[0];

    if (!name) {
      res.status(400);
      throw new Error('name_required');
    }
    if (!image) {
      res.status(400);
      throw new Error('image_required');
    }

    const exists = await Category.findOne({
      name: { $regex: name, $options: 'i' },
    });
    if (exists) {
      res.status(409);
      throw new Error('category_exists');
    }

    const filePath = `files/categories/${image.filename}`;

    rename(image.path, filePath, async (err) => {
      if (err) throw new Error('file_upload_failed');

      const category = await Category.create({ name, image: image.filename });
      res.status(201).json({ success: true, data: category });
    });
  } catch (error: any) {
    throw error;
  }
});

export const deleteCategory = expressAsyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      res.status(400);
      throw new Error('invalid_request');
    }
    const category = await Category.findByIdAndDelete(id).exec();
    if (!category) {
      res.status(404);
      throw new Error('category_not_found');
    }
    if (category.image) {
      await removeFile(category.image, 'files/categories');
    }
    res.status(200).json({
      success: true,
      message: t('category_deleted'),
    });
  } catch (error: any) {
    throw error;
  }
});

export const editCategory = expressAsyncHandler(async (req: any, res) => {
  try {
    const { id, name, oldImage } = req.body;
    const image = req.files?.image?.[0];

    const existingCategory = await Category.findOne({
      name: { $regex: name, $options: 'i' },
    });

    if (existingCategory && existingCategory.id.toString() !== id) {
      res.status(409);
      throw new Error('category_exists');
    }

    const updateData: any = { name };

    if (image) {
      const filePath = `files/categories/${image.filename}`;

      rename(image.path, filePath, async (err) => {
        if (err) throw new Error('file_upload_failed');
        updateData.image = image.filename;
        if (oldImage) removeFile(oldImage, 'files/categories');
      });
      updateData.image = image.filename;
    }
    const category = await Category.findByIdAndUpdate(id, updateData, {
      new: true,
    });
    if (!category) throw new Error('category_not_found');
    res.status(200).json({ success: true, data: category });
  } catch (error: any) {
    throw error;
  }
});
