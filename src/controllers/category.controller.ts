import expressAsyncHandler from 'express-async-handler';
import { Category } from '../models/category.model';
import { removeFile } from '../config/constants';
import { t } from 'i18next';
import { rename } from 'fs';
import { STATUS_TYPE } from '../config/enums';
import { UserRole } from '../config/constants';
export const getActiveCategories = expressAsyncHandler(
  async (req: any, res) => {
    try {
      const search = req.query.search;
      const matchQuery: any = {
        status: STATUS_TYPE.active,
      };
      if (search) {
        matchQuery.name = { $regex: search, $options: 'i' };
      }
      const categories = await Category.find(matchQuery)
        .select('name image')
        .sort({ createdAt: -1 })
        .exec();
      res.status(200).json({
        success: true,
        data: categories,
      });
    } catch (error) {
      throw error;
    }
  }
);

export const getCategories = expressAsyncHandler(async (req: any, res) => {
  try {
    const role = req.role;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const status = req.query.status;
    const search = req.query.search;

    const matchQuery: any = {};
    if (role === UserRole.SuperAdmin && status) {
      matchQuery.status = status;
    } else if (role === UserRole.Admin) {
      if (status) {
        if ([STATUS_TYPE.active, STATUS_TYPE.inactive].includes(status)) {
          matchQuery.status = status;
        } else {
          matchQuery.status = {
            $in: [STATUS_TYPE.active, STATUS_TYPE.inactive],
          };
        }
      } else {
        matchQuery.status = { $ne: STATUS_TYPE.deleted };
      }
    }
    if (search) {
      matchQuery.name = { $regex: search, $options: 'i' };
    }

    const categories = await Category.find(matchQuery)
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 })
      .populate(['createdBy', 'updatedBy'], 'name profile')
      .exec();

    const total = await Category.countDocuments(matchQuery).exec();

    res.status(200).json({
      success: true,
      data: {
        categories,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    throw error;
  }
});

export const createCategory = expressAsyncHandler(async (req: any, res) => {
  try {
    const { name } = req.body;
    const userId = req.user.id;
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
    }).exec();
    if (exists) {
      res.status(409);
      throw new Error('category_exists');
    }

    const filePath = `files/categories/${image.filename}`;

    rename(image.path, filePath, async (err) => {
      if (err) throw new Error('file_upload_failed');

      const category = await Category.create({
        name,
        image: image.filename,
        createdBy: userId,
        updatedBy: userId,
      });
      res.status(201).json({ success: true, data: category });
    });
  } catch (error) {
    throw error;
  }
});

export const deleteCategory = expressAsyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    if (!id) {
      res.status(400);
      throw new Error('invalid_request');
    }
    const category = await Category.findByIdAndUpdate(id, {
      status: STATUS_TYPE.deleted,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    }).exec();
    if (!category) {
      res.status(404);
      throw new Error('category_not_found');
    }
    res.status(200).json({
      success: true,
      message: t('category_deleted'),
    });
  } catch (error) {
    throw error;
  }
});

export const editCategory = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id, name, oldImage } = req.body;
    const image = req.files?.image?.[0];

    if (name && name.trim()) {
      const existingCategory = await Category.findOne({
        name: { $regex: name.trim(), $options: 'i' },
      }).exec();
      if (existingCategory && existingCategory.id.toString() !== id) {
        res.status(409);
        throw new Error('category_exists');
      }
    }

    const updateData: any = {};

    if (image) {
      const filePath = `files/categories/${image.filename}`;

      rename(image.path, filePath, async (err) => {
        if (err) throw new Error('file_upload_failed');
        updateData.image = image.filename;
        if (oldImage) removeFile(oldImage, 'files/categories');
      });
      updateData.image = image.filename;
    }
    if (name && name.trim()) {
      updateData.name = name;
    }
    const category = await Category.findByIdAndUpdate(
      id,
      { ...updateData, updatedBy: userId, updatedAt: new Date().toISOString() },
      {
        new: true,
      }
    )
      .populate(['createdBy', 'updatedBy'], 'name profile')
      .exec();
    if (!category) throw new Error('category_not_found');
    res.status(200).json({ success: true, data: category });
  } catch (error) {
    throw error;
  }
});

export const statusChange = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id, status } = req.body;
    if (
      !id ||
      !status ||
      ![STATUS_TYPE.active, STATUS_TYPE.inactive].includes(status)
    ) {
      throw new Error('invalid_request');
    }
    const category = await Category.findById(id).exec();
    if (!category) throw new Error('category_not_found');
    await Category.findByIdAndUpdate(id, {
      status,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    }).exec();
    res.status(200).json({
      success: true,
      message: t('status_changed'),
    });
  } catch (error) {
    throw error;
  }
});
