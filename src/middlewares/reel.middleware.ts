import expressAsyncHandler from 'express-async-handler';
import getVideoDurationInSeconds from 'get-video-duration';
import { join } from 'path';
import { REEL_VIDEO_FOLDER, removeFile } from '../config/constants';
import { Category } from '../models/category.model';
import { ObjectId } from 'mongodb';
export const validateCreateReel = expressAsyncHandler(
  async (req: any, res, next) => {
    let file;
    try {
      const { caption, categories: categoriesIds } = req.body;
      file = req.file;
      if (!file) {
        res.status(400);
        throw new Error('video_required');
      }
      
      const fileName = file.filename;
      const size = file.size;
      const duration = await getVideoDurationInSeconds(
        join(REEL_VIDEO_FOLDER, fileName)
      );
      const categories = JSON.parse(categoriesIds);
      if (!caption) {
        res.status(400);
        await removeFile(fileName, 'uploads/reels');
        throw new Error('caption_required');
      }
      if (!categories || categories.length === 0) {
        res.status(400);
        await removeFile(fileName, 'uploads/reels');
        throw new Error('categories_required');
      }
      for (let x of categories) {
        const category = await Category.findById(new ObjectId(x)).exec();
        if (!category) {
          res.status(404);
          await removeFile(fileName, 'uploads/reels');
          throw new Error('category_not_found');
        }
      }
      if (duration > 60) {
        res.status(400);
        await removeFile(fileName, 'uploads/reels');
        throw new Error('video_duration_exceeded');
      }
      if (size > 100 * 1024 * 1024) {
        res.status(400);
        await removeFile(fileName, 'uploads/reels');
        throw new Error('video_size_exceeded');
      }

      next();
    } catch (error: any) {
      if (file?.filename) await removeFile(file.filename, 'uploads/reels');
      next(error);
    }
  }
);

export const validateUpdateReel = expressAsyncHandler(
  async (req: any, res, next) => {
    let file;
    try {
      const { caption, categories: categoriesIds } = req.body;
      file = req.file;
      if (caption && caption.length === 0) {
        res.status(400);
        throw new Error('caption_required');
      }
      if (categoriesIds && JSON.parse(categoriesIds).length === 0) {
        res.status(400);
        throw new Error('categories_required');
      }
      for (let x of JSON.parse(categoriesIds)) {
        const category = await Category.findById(x).exec();
        if (!category) {
          res.status(404);
          throw new Error('category_not_found');
        }
      }
      if (file) {
        const fileName = file.filename;
        const size = file.size;
        const duration = await getVideoDurationInSeconds(
          join(REEL_VIDEO_FOLDER, fileName)
        );
        if (duration > 60) {
          res.status(400);
          throw new Error('video_duration_exceeded');
        }
        if (size > 100 * 1024 * 1024) {
          res.status(400);
          throw new Error('video_size_exceeded');
        }
      }
      next();
    } catch (error: any) {
      if (file?.filename) await removeFile(file.filename, 'uploads/reels');
      next(error);
    }
  }
);
