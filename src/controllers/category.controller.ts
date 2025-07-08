import expressAsyncHandler from 'express-async-handler';
import { Category } from '../models/category.model';
import {  removeFile } from '../config/constants';
import { t } from 'i18next';

export const getCategories = expressAsyncHandler(async (req: any, res) => {
  try {
    const categories = await Category.find()
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: categories,
    });
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
});

export const createCategory = expressAsyncHandler(async (req: any, res) => {
  try {
    let { name } = req.body;
    let image;
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400);
      throw new Error('name_required');
    }
    if (
      !req.file ||
      !req.file.filename ||
      !req.file.mimetype.startsWith('image/')
    ) {
      res.status(400);
      throw new Error('image_required');
    }
    image = req.file.filename;
    name = name.trim().toLowerCase();
    const existingCategory = await Category.findOne({ name }).exec();
    if (existingCategory) {
      res.status(409);
      await removeFile(image, 'uploads/categories');
      throw new Error('category_exists');
    }
    const category = await Category.create({ name, image });
    res.status(201).json({
      success: true,
      data: category,
    });
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
});

export const deleteCategory = expressAsyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400);
      throw new Error('invalid_category_id');
    }

    const category = await Category.findByIdAndDelete(id).exec();
    if (!category) {
      res.status(404);
      throw new Error('category_not_found');
    }
    if (category.image) {
      await removeFile(category.image, 'uploads/categories');
    }
    res.status(200).json({
      success: true,
      message: t('category_deleted'),
    });
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
});

export const editCategory = expressAsyncHandler(async (req: any, res) => {
  try {
    const { id, name, oldImage } = req.body;
    let image;
    if (
      req.file &&
      req.file.filename &&
      req.file.mimetype.startsWith('image/')
    ) {
      image = req.file.filename;
    }

    const existingCategory = await Category.findOne({ name }).exec();
    if (existingCategory && existingCategory?.id.toString() !== id) {
      res.status(409);
      await removeFile(image, 'uploads/categories');
      throw new Error('category_exists');
    }
    let categoryData: any = {};
    if (name) {
      categoryData.name = name;
    }

    if (image) {
      categoryData.image = image;
    }
    const category = await Category.findByIdAndUpdate(id, categoryData, {
      new: true,
    }).exec();
    if (!category) {
      res.status(404);
      await removeFile(image, 'uploads/categories');
      throw new Error('category_not_found');
    }
    if (oldImage) {
      await removeFile(oldImage, 'uploads/categories');
    }
    res.status(200).json({
      success: true,
      data: category,
    });
  } catch (error: any) {
    res.status(400);
    throw new Error(error.message);
  }
});
