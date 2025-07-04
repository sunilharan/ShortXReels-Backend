import expressAsyncHandler from 'express-async-handler';
import getVideoDurationInSeconds from 'get-video-duration';
import { join } from 'path';
import { REEL_VIDEO_FOLDER, removeFile } from '../config/constants';
import { Category } from '../models/category.model';
import { ObjectId } from 'mongodb';
export const validateCreateReel = expressAsyncHandler(
  async (req: any, res, next) => {
    let f;
    try {
      const { caption, categories : categoriesIds } = req.body;
      const file = req.file;
      const fileName = file.filename;
      const size = file.size;
      const duration = await getVideoDurationInSeconds(
        join(REEL_VIDEO_FOLDER, fileName)
      );
      const categories = JSON.parse(categoriesIds);
      f = fileName;
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
      if (!req.file) {
        res.status(400);
        await removeFile(fileName, 'uploads/reels');
        throw new Error('video_required');
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
      console.error(error);
      await removeFile(f, 'uploads/reels');
      res.status(400);
      throw new Error(error.message);
    }
  }
);
export const validateUpdateReel = expressAsyncHandler(
  async (req: any, res, next) => {
    try {
      const { caption, categories : categoriesIds } = req.body;
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
      if (req.file) {
        const file = req.file;
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
      console.error(error);
      res.status(400);
      throw new Error(error.message);
    }
  }
);
