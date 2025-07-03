import expressAsyncHandler from 'express-async-handler';
import { Category } from '../models/category.model';
import { removeFile } from '../config/constants';
import { t } from 'i18next';

export const getCategories = expressAsyncHandler(async (req: any, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const searchRegex = new RegExp(search, 'i');
    let categoryIds = [];
    if (req.query.categoryIds) {
      if (Array.isArray(req.query.categoryIds)) {
        categoryIds = req.query.categoryIds;
      } else if (typeof req.query.categoryIds === 'string') {
        try {
          const parsed = JSON.parse(req.query.categoryIds);
          categoryIds = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          categoryIds = [req.query.categoryIds];
        }
      }
    }
    const type = req.query.type || '';
    const matchQuery: any = {};

    if (search) {
      matchQuery.$or = [
        { name: { $regex: searchRegex } },
        { type: { $regex: searchRegex } },
      ];
    }

    if (categoryIds.length > 0) {
      matchQuery._id = { $in: categoryIds };
    }

    if (type) {
      matchQuery.type = type;
    }
    const total = await Category.countDocuments();
    const searchTotal = await Category.countDocuments(matchQuery);
    const categories = await Category.find(matchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .select('_id name type image createdAt updatedAt');

    let pagination: any = {};
    if (total) {
      pagination.total = total;
    }
    if (searchTotal) {
      pagination.searchTotal = searchTotal;
    }
    if (page > 1) {
      pagination.previousPage = page - 1;
    }
    if (page) {
      pagination.currentPage = page;
    }
    if (page < Math.ceil(total / limit)) {
      pagination.nextPage = page + 1;
    }

    res.status(200).json({
      success: true,
      data: {
        categories,
        pagination,
      },
    });
  } catch (error: any) {
    console.error(req.query);
    console.error(error);
    res.status(400);
    throw new Error(error.message);
  }
});

export const createCategory = expressAsyncHandler(async (req: any, res) => {
  try {
    let { name, type } = req.body;
    let image;
    if (
      !name ||
      !type ||
      typeof name !== 'string' ||
      typeof type !== 'string'
    ) {
      res.status(400);
      throw new Error('name_and_type_required');
    }
    if (req.file) {
      image = req.file.filename;
    }
    name = name.trim().toLowerCase();
    const existingCategory = await Category.findOne({ name, type }).exec();
    if (existingCategory) {
      res.status(409);
      await removeFile(image, 'uploads/categories');
      throw new Error('category_exists');
    }
    const category = await Category.create({ name, type, image });
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
    const { id, name, type, oldImage } = req.body;
    let image;
    if (req.file) {
      image = req.file.filename;
    }

    const existingCategory = await Category.findOne({ name, type }).exec();
    if (existingCategory && existingCategory?.id.toString() !== id) {
      res.status(409);
      await removeFile(image, 'uploads/categories');
      throw new Error('category_exists');
    }
    let categoryData: any = {};
    if (name) {
      categoryData.name = name;
    }
    if (type) {
      categoryData.type = type;
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
