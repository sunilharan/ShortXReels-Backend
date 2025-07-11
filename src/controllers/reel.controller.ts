import expressAsyncHandler from 'express-async-handler';
import path, { join } from 'path';
import {
  LIKE,
  MEDIA,
  REEL_FOLDER,
  removeFile,
  STATUS,
  UserRole,
} from '../config/constants';
import { IReel, Reel } from '../models/reel.model';
import { t } from 'i18next';
import { ObjectId } from 'mongodb';
import { createReadStream, existsSync, statSync, unlinkSync } from 'fs';
import { User } from '../models/user.model';
import { config } from '../config/config';
import { Category } from '../models/category.model';
import { PipelineStage } from 'mongoose';

export const getReels = expressAsyncHandler(async (req: any, res) => {
  const userId = req.userId;
  const limit = parseInt(req.query.limit) || 10;
  const skip = 0;
  const removeReels = JSON.parse(req.query.reelIds || '[]');
  const categoryId = req.query.categoryId || '';

  const matchQuery: any = { status: STATUS.active };
  if (categoryId && categoryId !== 'recommended') {
    matchQuery.categories = { $in: [new ObjectId(categoryId)] };
  }
  if (removeReels.length) {
    matchQuery._id = {
      $nin: removeReels.map((id: string) => new ObjectId(id)),
    };
  }

  const total = await Reel.countDocuments(matchQuery);
  const reels = await fetchReels(userId, matchQuery, { limit });

  res.status(200).json({
    success: true,
    data: {
      reels,
      totalRecords: total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export const getReelsByUser = expressAsyncHandler(async (req: any, res) => {
  const userId = req.query.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  if (!userId) {
    res.status(400)
    throw new Error('invalid_user_id');
  }
  const user=await User.findById(userId)
  if(!user){
    res.status(404)
    throw new Error('user_not_found')
  }
  const matchQuery = { createdBy: new ObjectId(user.id) };
  const total = await Reel.countDocuments(matchQuery);
  const reels = await fetchReels(user.id, matchQuery, { skip, limit });

  res.status(200).json({
    success: true,
    data: {
      reels,
      totalRecords: total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export const dashboardReels = expressAsyncHandler(
  async (req: any, res: any) => {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId).populate('interests', 'name');

      const reels = await Reel.aggregate([
        { $match: { status: 'active' } },
        {
          $lookup: {
            from: 'categories',
            localField: 'categories',
            foreignField: '_id',
            as: 'categoryDetails',
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'createdBy',
            foreignField: '_id',
            as: 'creator',
          },
        },
        {
          $lookup: {
            from: 'comments',
            let: { reelId: '$_id' },
            pipeline: [
              { $match: { $expr: { $eq: ['$reel', '$$reelId'] } } },
              { $count: 'count' },
            ],
            as: 'commentData',
          },
        },
        {
          $addFields: {
            totalLikes: { $size: { $ifNull: ['$likedBy', []] } },
            totalViews: { $size: { $ifNull: ['$viewedBy', []] } },
            totalComments: {
              $ifNull: [{ $arrayElemAt: ['$commentData.count', 0] }, 0],
            },
            isLiked: {
              $in: [new ObjectId(userId), { $ifNull: ['$likedBy', []] }],
            },
          },
        },
        {
          $project: {
            id: '$_id',
            caption: 1,
            media: 1,
            mediaType: 1,
            duration: 1,
            thumbnail: 1,
            totalViews: 1,
            totalLikes: 1,
            totalComments: 1,
            createdAt: 1,
            isLiked: 1,
            categories: 1,
            createdBy: {
              name: { $arrayElemAt: ['$creator.name', 0] },
              profile: { $arrayElemAt: ['$creator.profile', 0] },
              id: { $arrayElemAt: ['$creator._id', 0] },
            },
            categoryDetails: 1,
          },
        },
        {
          $sort: { createdAt: -1 },
        },
      ]);

      const categoryCounts: Record<string, number> = {};
      const categoryMap: Record<string, any[]> = {};
      const recommended: any[] = [];

      for (const reel of reels) {
        const availableCategories = reel.categories.map((c: any) =>
          c.toString()
        );
        const userInterestCategories = availableCategories.filter((id: any) =>
          user?.interests.some((i: any) => i._id.toString() === id)
        );

        if (userInterestCategories.length) {
          let assignedCategory = userInterestCategories[0];
          let minCount = categoryCounts[assignedCategory] || 0;

          for (const cid of userInterestCategories) {
            const currentCount = categoryCounts[cid] || 0;
            if (currentCount < minCount) {
              assignedCategory = cid;
              minCount = currentCount;
            }
          }

          categoryCounts[assignedCategory] =
            (categoryCounts[assignedCategory] || 0) + 1;
          if (!categoryMap[assignedCategory])
            categoryMap[assignedCategory] = [];
          categoryMap[assignedCategory].push(reel);
        } else {
          recommended.push(reel);
        }
      }

      const allCategories = await Category.find();
      let result: any[] = [];

      for (const category of allCategories) {
        if (!categoryMap[category.id]) continue;
        result.push({
          category: {
            id: category.id,
            name: category.name,
            image: `${config.host}/category/${category.image}`,
          },
          reels: categoryMap[category.id].map((r: any) => ({
            id: r.id,
            caption: r.caption,
            media:
              r.mediaType === 'video'
                ? `${config.host}/api/reel/view/${r.id}`
                : r.media?.map((img: any) => `${config.host}/reel/${img}`),
            duration: r.duration,
            thumbnail: r.thumbnail
              ? `${config.host}/thumbnail/${r.thumbnail}`
              : undefined,
            totalViews: r.totalViews,
            mediaType: r.mediaType,
            totalLikes: r.totalLikes,
            totalComments: r.totalComments,
            createdAt: r.createdAt,
            createdBy: r.createdBy,
            isLiked: r.isLiked,
          })),
        });
      }

      result = result
        .filter((r) => r.category.id !== 'recommended')
        .sort((a, b) => a.category.name.localeCompare(b.category.name));

      if (recommended.length > 0) {
        result.push({
          category: {
            id: 'recommended',
            name: 'Recommended',
            image: `${config.host}/category/default.jpg`,
          },
          reels: recommended.slice(0, 5).map((r: any) => ({
            id: r.id,
            caption: r.caption,
            media:
              r.mediaType === 'video'
                ? `${config.host}/api/reel/view/${r.id}`
                : r.media?.map((img: any) => `${config.host}/reel/${img}`),
            duration: r.duration,
            thumbnail: r.thumbnail
              ? `${config.host}/thumbnail/${r.thumbnail}`
              : undefined,
            totalViews: r.totalViews,
            mediaType: r.mediaType,
            totalLikes: r.totalLikes,
            totalComments: r.totalComments,
            createdAt: r.createdAt,
            createdBy: r.createdBy,
            isLiked: r.isLiked,
          })),
        });
      }

      res.status(200).json({ success: true, data: result });
    } catch (error) {
      throw error;
    }
  }
);

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
    const sortType = req.query.sortType || '';
    const sortOrder = req.query.sortOrder || '';
    const mediaType = req.query.mediaType || '';
    let sortQuery = {};
    if (sortType && sortOrder) {
      sortQuery = { [sortType]: sortOrder === 'desc' ? -1 : 1 };
    }
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
    if (mediaType) {
      matchQuery.mediaType = mediaType;
    }
    matchQuery.status = STATUS.active;
    const total = await Reel.countDocuments(matchQuery);
    const reels = await Reel.find(matchQuery)
      .sort(sortQuery)
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
    throw error;
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
      .populate('viewedBy', 'name profile')
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
    throw error;
  }
});

export const createReel = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const {
      caption,
      categories: rawCategories,
      mediaType,
      duration,
    } = req.body;
    const categories = JSON.parse(rawCategories).map(
      (id: string) => new ObjectId(id)
    );

    const files = req.files || {};
    let reelData: Partial<IReel> = {
      createdBy: new ObjectId(userId),
      caption,
      categories,
      mediaType,
    };

    if (mediaType === MEDIA.video) {
      const mediaFile = files.media?.[0];
      if (mediaFile) {
        reelData.media = mediaFile.filename;
        reelData.duration = parseFloat(duration) || 0;
      }
    } else if (mediaType === MEDIA.image) {
      const images = files.media?.map((img: any) => img.filename) || [];
      reelData.media = images.length > 0 ? images : [];
    }

    const thumbnail = files.thumbnail?.[0];
    if (thumbnail) {
      reelData.thumbnail = thumbnail.filename;
    }

    const reel = await Reel.create(reelData);
    const populatedReel = await Reel.findById(reel._id)
      .populate('createdBy', 'name profile')
      .populate('categories', 'name image')
      .populate('likedBy', 'name profile')
      .populate('viewedBy', 'name profile');
    res.status(201).json({ success: true, data: populatedReel });
  } catch (error: any) {
    throw error;
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
    if (reel.media) {
      if (reel.mediaType === MEDIA.video) {
        await removeFile(reel?.media as string, 'uploads/reels');
      } else if (reel.mediaType === MEDIA.image) {
        if (Array.isArray(reel.media)) {
          reel.media.forEach((img: any) => {
            removeFile(img, 'uploads/reels');
          });
        } else {
          removeFile(reel.media, 'uploads/reels');
        }
      }
    }
    if (reel.thumbnail) {
      await removeFile(reel.thumbnail, 'uploads/thumbnails');
    }
    res.status(200).json({
      success: true,
      message: t('reel_deleted'),
    });
  } catch (error: any) {
    throw error;
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
    if (!action || (action !== LIKE.like && action !== LIKE.unlike)) {
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
      if (action === LIKE.like) {
        if (!alreadyLiked) {
          reel = await Reel.findByIdAndUpdate(
            id,
            { $addToSet: { likedBy: new ObjectId(userId) } },
            { new: true }
          ).exec();
        } else {
          reel = reelDoc;
        }
      } else if (action === LIKE.unlike) {
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
      message: t('like_unlike_success'),
    });
  } catch (error: any) {
    throw error;
  }
});

export const streamReelVideo = expressAsyncHandler(async (req: any, res) => {
  try {
    // console.log(`Streaming video for ID: ${req.params.id}`);
    const reelId = new ObjectId(req.params.id);
    if (!reelId || !ObjectId.isValid(reelId)) {
      res.status(400);
      throw new Error('invalid_reel_id');
    }
    const reel = await Reel.findById(reelId);
    if (!reel) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    if (reel.mediaType !== MEDIA.video || !reel.media) {
      res.status(404);
      throw new Error('media_not_found');
    }

    const videoPath = join(REEL_FOLDER, reel.media as string);
    if (!existsSync(videoPath)) {
      res.status(404);
      throw new Error('video_not_found');
    }

    const stat = statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    // const userId = req.userId;
    // await Reel.findByIdAndUpdate(reelId, {
    //   $push: { viewedBy: new ObjectId(userId) },
    // }).exec();
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
          (reel.media as string) || ''
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
    throw error;
  }
});

async function fetchReels(
  userId: string,
  matchQuery: any,
  options: { skip?: number; limit?: number } = {}
) {
  const { skip = 0, limit = 10 } = options;
  const results = await Reel.aggregate([
    { $match: matchQuery },
    {
      $lookup: {
        from: 'users',
        localField: 'createdBy',
        foreignField: '_id',
        as: 'createdBy',
      },
    },
    { $unwind: '$createdBy' },
    {
      $lookup: {
        from: 'comments',
        let: { reelId: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$reel', '$$reelId'] } } },
          { $count: 'count' },
        ],
        as: 'commentStats',
      },
    },
    {
      $addFields: {
        totalViews: {
          $cond: {
            if: { $isArray: '$viewedBy' },
            then: { $size: '$viewedBy' },
            else: 0,
          },
        },
        totalLikes: {
          $cond: {
            if: { $isArray: '$likedBy' },
            then: { $size: '$likedBy' },
            else: 0,
          },
        },
        totalComments: {
          $cond: [
            { $gt: [{ $size: '$commentStats' }, 0] },
            { $arrayElemAt: ['$commentStats.count', 0] },
            0,
          ],
        },
        media: {
          $cond: [
            { $isArray: '$media' },
            {
              $map: {
                input: '$media',
                as: 'm',
                in: { $concat: [config.host + '/reel/', '$$m'] },
              },
            },
            {
              $concat: [config.host + '/api/reel/view/', { $toString: '$_id' }],
            },
          ],
        },
        thumbnail: {
          $concat: [config.host + '/thumbnail/', '$thumbnail'],
        },
        'createdBy.profile': {
          $cond: {
            if: {
              $or: [
                { $eq: ['$createdBy.profile', ''] },
                { $eq: ['$createdBy.profile', null] },
              ],
            },
            then: '',
            else: {
              $concat: [config.host + '/profile/', '$createdBy.profile'],
            },
          },
        },
      },
    },
    {
      $project: {
        _id: 0,
        id: '$_id',
        caption: 1,
        media: 1,
        mediaType: 1,
        duration: 1,
        thumbnail: 1,
        totalViews: 1,
        totalLikes: 1,
        totalComments: 1,
        isLiked: { $in: [new ObjectId(userId), '$likedBy'] },
        createdAt: 1,
        createdBy: {
          name: '$createdBy.name',
          profile: {
            $cond: {
              if: {
                $or: [
                  { $eq: ['$createdBy.profile', null] },
                  { $eq: ['$createdBy.profile', ''] },
                  { $not: ['$createdBy.profile'] },
                ],
              },
              then: '$$REMOVE',
              else: {
                $concat: [config.host + '/profile/', '$createdBy.profile'],
              },
            },
          },
          id: '$createdBy._id',
        },
      },
    },
    { $sort: { createdAt: -1 } },
    ...(skip ? [{ $skip: skip }] : []),
    { $limit: limit },
  ]).exec();
  return results;
}
