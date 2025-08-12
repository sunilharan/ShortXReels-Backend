import expressAsyncHandler from 'express-async-handler';
import { MEDIA_TYPE } from '../config/enums';
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
      if (mediaType === MEDIA_TYPE.video && (!duration || duration > 60)) {
        res.status(400);
        throw new Error('invalid_duration');
      }

      const mediaFiles = files.media;
      if (!mediaFiles || mediaFiles.length === 0) {
        res.status(400);
        throw new Error('media_required');
      }

      const thumbnailFile = files.thumbnail?.[0];
      if (!thumbnailFile) {
        res.status(400);
        throw new Error('thumbnail_required');
      }
      next();
    } catch (error) {
      throw error;
    }
  }
);
