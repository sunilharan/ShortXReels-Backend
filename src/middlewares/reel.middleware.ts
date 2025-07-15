import expressAsyncHandler from 'express-async-handler';
import {
  MEDIA_TYPE,
} from '../config/constants';
import { Category } from '../models/category.model';
import { ObjectId } from 'mongodb';

export const validateCreateReel = expressAsyncHandler(
  async (req: any, res, next) => {
    const files = req.files || {};
    try {
      const {
        caption,
        categories: rawCategories,
        mediaType,
        duration,
      } = req.body;
      if (!caption) throw new Error('caption_required');
      if (!mediaType || ![MEDIA_TYPE.video, MEDIA_TYPE.image].includes(mediaType)) {
        throw new Error('invalid_media_type');
      }
      const categories = JSON.parse(rawCategories || '[]');
      if (!Array.isArray(categories) || categories.length === 0) {
        throw new Error('categories_required');
      }

      for (const id of categories) {
        const exists = await Category.exists({ _id: new ObjectId(id) });
        if (!exists) throw new Error('category_not_found');
      }

      const mediaFiles = files.media;
      if (!mediaFiles || mediaFiles.length === 0) {
        throw new Error('media_required');
      }

      if (mediaType === MEDIA_TYPE.video) {
        const mediaFile = mediaFiles[0];
        if (!mediaFile.mimetype.startsWith('video/')) {
          throw new Error('invalid_video_format');
        }
        const durationNum = parseFloat(duration);
        if (isNaN(durationNum) || durationNum <= 0) {
          throw new Error('invalid_duration');
        }
      } else if (mediaType === MEDIA_TYPE.image) {
        for (const img of mediaFiles) {
          if (!img.mimetype.startsWith('image/')) {
            throw new Error('invalid_image_format');
          }
        }
      }
      next();
    } catch (error: any) {
      res.status(400);
      throw new Error(error.message);
    }
  }
);
