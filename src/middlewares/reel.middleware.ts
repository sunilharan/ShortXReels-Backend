import expressAsyncHandler from 'express-async-handler';
import { imageMaxSize, MEDIA_TYPE } from '../config/constants';
import { Category } from '../models/category.model';
import mongoose from 'mongoose';

export const validateCreateReel = expressAsyncHandler(
  async (req: any, res, next) => {
    try {
      const files = req.files || {};
      const {
        caption,
        categories: rawCategories,
        mediaType,
        duration,
      } = req.body;

      if (!caption) {
        res.status(400);
        throw new Error('caption_required');
      }

      if (
        !mediaType ||
        ![MEDIA_TYPE.video, MEDIA_TYPE.image].includes(mediaType)
      ) {
        res.status(400);
        throw new Error('invalid_media_type');
      }

      const categories = JSON.parse(rawCategories || '[]');
      if (!Array.isArray(categories) || categories.length === 0) {
        res.status(400);
        throw new Error('categories_required');
      }

      for (const id of categories) {
        const exists = await Category.exists({
          _id: new mongoose.Types.ObjectId(id as string),
        });
        if (!exists) {
          res.status(404);
          throw new Error('category_not_found');
        }
      }

      const mediaFiles = files.media;
      if (!mediaFiles || mediaFiles.length === 0) {
        res.status(400);
        throw new Error('media_required');
      }

      const videoFiles = mediaFiles.filter((f: any) =>
        f.mimetype.startsWith('video/')
      );
      const imageFiles = mediaFiles.filter((f: any) =>
        f.mimetype.startsWith('image/')
      );

      if (mediaType === MEDIA_TYPE.video) {
        if (imageFiles.length > 0) {
          res.status(400);
          throw new Error('invalid_video_format');
        }
        const durationNum = parseFloat(duration);
        if (isNaN(durationNum) || durationNum <= 0) {
          res.status(400);
          throw new Error('invalid_duration');
        }
      } else if (mediaType === MEDIA_TYPE.image) {
        if (videoFiles.length > 0) {
          res.status(400);
          throw new Error('invalid_image_format');
        }
        imageFiles.forEach((f: any) => {
          if (f.size > imageMaxSize) {
            res.status(400);
            throw new Error('image_max_size_exceeded');
          }
        });
      }

      const thumbnailFile = files.thumbnail?.[0];
      if (!thumbnailFile) {
        res.status(400);
        throw new Error('thumbnail_required');
      }
      if (thumbnailFile) {
        if (thumbnailFile.size > imageMaxSize) {
          res.status(400);
          throw new Error('image_max_size_exceeded');
        }
      }
      next();
    } catch (error: any) {
      throw error;
    }
  }
);
