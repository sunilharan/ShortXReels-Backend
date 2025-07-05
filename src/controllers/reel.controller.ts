import expressAsyncHandler from 'express-async-handler';
import path, { join } from 'path';
import { getVideoDurationInSeconds } from 'get-video-duration';
import {
  REEL_VIDEO_FOLDER,
  removeFile,
  STATUS,
  UserRole,
} from '../config/constants';
import { Reel } from '../models/reel.model';
import { ObjectId } from 'mongodb';
import { t } from 'i18next';
import { createReadStream, existsSync, statSync } from 'fs';
import { User } from '../models/user.model';

export const getReels = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const searchRegex = new RegExp(search, 'i');
    const matchQuery: any = {};
    const categoriesFilter = req.query.categories || '';
    const feedType = req.query.feedType || '';
    let sortQuery = {};
    if (feedType === 'newHot') {
      sortQuery = { createdAt: -1, views: -1 };
    } else if (feedType === 'popular') {
      sortQuery = { views: -1, createdAt: -1 };
    } else if (feedType === 'original') {
      sortQuery = { createdAt: 1, views: -1 };
    } else if (feedType === 'userIntrested') {
      const user = await User.findById(userId);
      if (user?.interests?.length) {
        matchQuery.categories = { $in: user.interests };
      }
    }
    if (categoriesFilter) {
      matchQuery.categories = {
        $in: JSON.parse(categoriesFilter).map((id: string) => new ObjectId(id)),
      };    
    }
    if (search) {
      matchQuery.caption = { $regex: searchRegex };
    }
    const total = await Reel.countDocuments(matchQuery);
    const reels = await Reel.find(matchQuery)
      .sort(sortQuery)
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name profile')
      .populate('categories', 'name image')
      .populate('likedBy', 'name profile');
    res.status(200).json({
      success: true,
      data: {
        reels,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error(error);
    res.status(400);
    throw new Error(error.message);
  }
});

export const userReels = expressAsyncHandler(async (req: any, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const searchRegex = new RegExp(search, 'i');
    const matchQuery: any = {};
    const userId = req.userId;
    const categoriesFilter = req.query.categories || '';
    if (search) {
      matchQuery.caption = { $regex: searchRegex };
    }
    if (userId && typeof userId === 'string') {
      matchQuery.createdBy = new ObjectId(userId);
    }
    if (categoriesFilter) {
      matchQuery.categories = {
        $in: JSON.parse(categoriesFilter).map((id: string) => new ObjectId(id)),
      };
    }
    matchQuery.status = STATUS.active;
    const total = await Reel.countDocuments(matchQuery);
    const reels = await Reel.find(matchQuery)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('createdBy', 'name profile')
      .populate('categories', 'name image');

    res.status(200).json({
      success: true,
      data: {
        reels,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error(error);
    res.status(400);
    throw new Error(error.message);
  }
});

export const reelById = expressAsyncHandler(async (req: any, res) => {
  try {
    const { id } = req.params;
    if (!id || !ObjectId.isValid(id)) {
      res.status(400);
      throw new Error('invalid_reel_id');
    }
    let reel = await Reel.findById(id)
      .populate('createdBy', 'name profile')
      .populate('categories', 'name image')
      .populate('likedBy', 'name profile')
      .exec();
    if (!reel) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    res.status(200).json({
      success: true,
      data: reel,
    });
  } catch (error: any) {
    console.error(error);
    res.status(400);
    throw new Error(error.message);
  }
});

export const createReel = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const { caption, categories: categoryIds } = req.body;
    const file = req.file;
    const fileName = file.filename;
    const size = file.size;
    const duration = await getVideoDurationInSeconds(
      join(REEL_VIDEO_FOLDER, fileName)
    );

    const categories = JSON.parse(categoryIds).map(
      (id: string) => new ObjectId(id)
    );

    const reelData: any = {
      createdBy: new ObjectId(userId),
      caption,
      categories,
      video: fileName,
      size,
      duration,
    };
    const reel = await Reel.create(reelData);
    const populatedReel = await Reel.findById(reel._id)
      .populate('createdBy', 'name profile')
      .populate('categories', 'name image')
      .populate('likedBy', 'name profile');
    res.status(201).json({
      success: true,
      data: populatedReel,
    });
  } catch (error: any) {
    console.error(error);
    res.status(400);
    throw new Error(error.message);
  }
});

export const deleteReel = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const role = req.role;
    const { id } = req.params;
    if (!id || !ObjectId.isValid(id)) {
      res.status(400);
      throw new Error('invalid_reel_id');
    }
    let reel;
    if (role === UserRole.SuperAdmin || role === UserRole.Admin) {
      reel = await Reel.findByIdAndDelete(id).exec();
    } else {
      reel = await Reel.findOneAndDelete({ createdBy: userId, _id: id }).exec();
    }
    if (!reel) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    if (reel.video) {
      await removeFile(reel.video, 'uploads/reels');
    }
    res.status(200).json({
      success: true,
      message: t('reel_deleted'),
    });
  } catch (error: any) {
    console.error(error);
    res.status(400);
    throw new Error(error.message);
  }
});

export const editReel = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const { id, caption, categories, oldVideo } = req.body;
    const file = req.file;
    let reelData: any = {};
    if (caption) {
      reelData.caption = caption;
    }
    if (categories) {
      reelData.categories = JSON.parse(categories).map(
        (id: string) => new ObjectId(id)
      );
    }
    if (file) {
      reelData.video = file.filename;
      reelData.size = file.size;
      reelData.duration = await getVideoDurationInSeconds(
        join(REEL_VIDEO_FOLDER, file.filename)
      );
    }
    if (oldVideo) {
      await removeFile(oldVideo, 'uploads/reels');
    }
    const reel = await Reel.findOneAndUpdate(
      { createdBy: userId, _id: id },
      reelData,
      { new: true }
    )
      .populate('createdBy', 'name profile')
      .populate('categories', 'name image')
      .populate('likedBy', 'name profile')
      .exec();
    if (!reel) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    res.status(200).json({
      success: true,
      data: reel,
    });
  } catch (error: any) {
    console.error(error);
    res.status(400);
    throw new Error(error.message);
  }
});

export const likeUnlikeReel = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const { id, action } = req.body;

    if (!id || !ObjectId.isValid(id)) {
      res.status(400);
      throw new Error('invalid_reel_id');
    }
    if (!action || (action !== 'like' && action !== 'unlike')) {
      res.status(400);
      throw new Error('invalid_action');
    }
    let reel;
    const reelDoc = await Reel.findById(id).exec();
    if (!reelDoc) {
      reel = null;
    } else {
      const alreadyLiked = reelDoc.likedBy.some(
        (uid: any) => uid.toString() === userId
      );
      if (action === 'like') {
        if (!alreadyLiked) {
          reel = await Reel.findByIdAndUpdate(
            id,
            { $addToSet: { likedBy: new ObjectId(userId) } },
            { new: true }
          ).exec();
        } else {
          reel = reelDoc;
        }
      } else if (action === 'unlike') {
        if (alreadyLiked) {
          reel = await Reel.findByIdAndUpdate(
            id,
            { $pull: { likedBy: new ObjectId(userId) } },
            { new: true }
          ).exec();
        } else {
          reel = reelDoc;
        }
      }
    }
    if (!reel) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    res.status(200).json({
      success: true,
      data: {
        id: reel._id,
        likedBy: reel.likedBy,
        likesCount: reel.likedBy.length,
      },
    });
  } catch (error: any) {
    console.error(error);
    res.status(400);
    throw new Error(error.message);
  }
});

export const streamReelVideo = expressAsyncHandler(async (req: any, res) => {
  try {
    console.log(`Streaming video for ID: ${req.params.id}`);
    const videoId = new ObjectId(req.params.id);
    if (!videoId || !ObjectId.isValid(videoId)) {
      res.status(400);
      throw new Error('invalid_reel_id');
    }
    const reel = await Reel.findById(videoId);
    if (!reel) {
      res.status(404);
      throw new Error('reel_not_found');
    }

    const videoPath = join(REEL_VIDEO_FOLDER, reel.video);
    if (!existsSync(videoPath)) {
      console.error(`Video file not found at path: ${videoPath}`);
      res.status(404);
      throw new Error('video_not_found');
    }

    const stat = statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;

    await Reel.findByIdAndUpdate(videoId, {
      $inc: { views: 1 },
    }).exec();
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        res.status(416).setHeader('Content-Range', `bytes */${fileSize}`);
        res.end();
        return;
      }

      const chunkSize = end - start + 1;
      const file = createReadStream(videoPath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Content-Type-Options': 'nosniff',
      });

      file.pipe(res);
    } else {
      const file = createReadStream(videoPath);

      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Content-Disposition': `inline; filename="${reel.caption}${path.extname(
          reel.video
        )}"`,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
        'X-Content-Type-Options': 'nosniff',
      });

      file.pipe(res);
    }
  } catch (error) {
    console.error('Video stream error:', error);
    res.status(500).json({ message: 'internal_server_error' });
  }
});
