import expressAsyncHandler from 'express-async-handler';
import path, { join } from 'path';
import {
  LIKE,
  MEDIA,
  REEL_FOLDER,
  removeFile,
  SORT_TYPE,
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
  const userId = req.user.id;
  const limit = parseInt(req.query.limit) || 10;

  const profileUserId = req.query.profileUserId || '';
  const removeReels = JSON.parse(req.query.removeReelIds || '[]');
  const categoryId = req.query.categoryId || '';
  const addReels = JSON.parse(req.query.addReelIds || '[]');

  const matchQuery: any = { status: STATUS.active };
  let addedReels: any[] = [];

  if (profileUserId) {
    matchQuery.createdBy = new ObjectId(profileUserId);

    const mainReels = await fetchReels(userId, matchQuery, { limit });

    if (addReels.length) {
      const addReelQuery = {
        _id: { $in: addReels.map((id: string) => new ObjectId(id)) },
      };
      addedReels = await fetchReels(userId, addReelQuery, {
        limit: addReels.length,
      });
    }

    const reelsMap = new Map<string, any>();
    addedReels.forEach((reel) => reelsMap.set(reel.id.toString(), reel));
    mainReels.forEach((reel) => reelsMap.set(reel.id.toString(), reel));

    const finalReels = Array.from(reelsMap.values()).slice(0, limit);
    const totalRecords = await Reel.countDocuments(matchQuery);
    const totalPages = Math.ceil(totalRecords / limit);

    res.status(200).json({
      success: true,
      data: {
        reels: finalReels,
        totalRecords,
        totalPages,
      },
    });
  } else {
    if (categoryId && categoryId !== 'recommended') {
      matchQuery.categories = { $in: [new ObjectId(categoryId)] };
    }
    if (removeReels.length) {
      matchQuery._id = {
        $nin: removeReels.map((id: string) => new ObjectId(id)),
      };
    }

    const mainReels = await fetchReels(userId, matchQuery, { limit });

    if (addReels.length) {
      const addReelQuery = {
        _id: { $in: addReels.map((id: string) => new ObjectId(id)) },
      };
      addedReels = await fetchReels(userId, addReelQuery, {
        limit: addReels.length,
      });
    }

    const reelsMap = new Map<string, any>();
    addedReels.forEach((reel) => reelsMap.set(reel.id.toString(), reel));
    mainReels.forEach((reel) => reelsMap.set(reel.id.toString(), reel));

    const finalReels = Array.from(reelsMap.values()).slice(0, limit);
    const totalRecords = await Reel.countDocuments(matchQuery);
    const totalPages = Math.ceil(totalRecords / limit);

    res.status(200).json({
      success: true,
      data: {
        reels: finalReels,
        totalRecords,
        totalPages,
      },
    });
  }
});

export const getReelsByUser = expressAsyncHandler(async (req: any, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const id = req.query.userId;
  const sortType = req.query.sortType;
  let sortQuery = {};
  if (sortType === SORT_TYPE.popular) {
    sortQuery = {
      totalViews: -1,
      totalLikes: -1,
      totalComments: -1,
      createdAt: -1,
    };
  } else if (sortType === SORT_TYPE.latest) {
    sortQuery = { createdAt: -1 };
  } else if (sortType === SORT_TYPE.oldest) {
    sortQuery = { createdAt: 1 };
  } else {
    sortQuery = { createdAt: -1 };
  }
  if (!id) {
    res.status(400);
    throw new Error('invalid_user_id');
  }
  const user = await User.findById(id).select(
    'id name email phone gender birth status profile displayName description'
  );
  if (!user) {
    res.status(404);
    throw new Error('user_not_found');
  }
  const matchQuery = { createdBy: new ObjectId(user.id) };
  const total = await Reel.countDocuments(matchQuery);
  const reels = await fetchReels(userId, matchQuery, {
    skip,
    limit,
    sortQuery,
  });

  res.status(200).json({
    success: true,
    data: {
      ...user.toJSON(),
      reels,
      totalRecords: total,
      totalReels: total,
      totalPages: Math.ceil(total / limit),
    },
  });
});

export const dashboardReels = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = new ObjectId(req.user.id);
    const user = await User.findById(userId).select('interests').lean();
    const interestIds =
      user?.interests.map((i: any) => new ObjectId(i.id)) || [];

    const interestReels = await Reel.aggregate([
      { $match: { status: 'active', categories: { $in: interestIds } } },
      { $sort: { createdAt: -1 } },
      { $unwind: '$categories' },
      { $match: { categories: { $in: interestIds } } },
      {
        $lookup: {
          from: 'categories',
          localField: 'categories',
          foreignField: '_id',
          as: 'catInfo',
        },
      },
      { $unwind: '$catInfo' },
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'creator',
        },
      },
      { $unwind: '$creator' },
      {
        $lookup: {
          from: 'comments',
          let: { id: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$reel', '$$id'] } } },
            { $count: 'count' },
          ],
          as: 'comments',
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
              { $gt: [{ $size: '$comments' }, 0] },
              { $arrayElemAt: ['$comments.count', 0] },
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
                $concat: [
                  config.host + '/api/reel/view/',
                  { $toString: '$_id' },
                ],
              },
            ],
          },
          thumbnail: { $concat: [config.host + '/thumbnail/', '$thumbnail'] },
          isLiked: { $in: [userId, { $ifNull: ['$likedBy', []] }] },
        },
      },
      {
        $group: {
          _id: '$categories',
          name: { $first: '$catInfo.name' },
          image: { $first: '$catInfo.image' },
          reels: {
            $push: {
              id: '$_id',
              caption: '$caption',
              mediaType: '$mediaType',
              media: '$media',
              duration: '$duration',
              thumbnail: '$thumbnail',
              totalViews: '$totalViews',
              totalLikes: '$totalLikes',
              totalComments: '$totalComments',
              createdAt: '$createdAt',
              isLiked: '$isLiked',
              createdBy: {
                id: '$creator._id',
                name: '$creator.name',
                profile: {
                  $cond: {
                    if: {
                      $or: [
                        { $eq: ['$creator.profile', null] },
                        { $eq: ['$creator.profile', ''] },
                        { $not: ['$creator.profile'] },
                      ],
                    },
                    then: '$$REMOVE',
                    else: {
                      $concat: [config.host + '/profile/', '$creator.profile'],
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          category: {
            id: '$_id',
            name: '$name',
            image: { $concat: [config.host + '/category/', '$image'] },
          },
          reels: 1,
        },
      },
      { $sort: { 'category.name': 1 } },
    ]);

    const recommended = await Reel.aggregate([
      { $match: { status: 'active', categories: { $nin: interestIds } } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'creator',
        },
      },
      { $unwind: '$creator' },
      {
        $lookup: {
          from: 'comments',
          let: { id: '$_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$reel', '$$id'] } } },
            { $count: 'count' },
          ],
          as: 'comments',
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
              { $gt: [{ $size: '$comments' }, 0] },
              { $arrayElemAt: ['$comments.count', 0] },
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
                $concat: [
                  config.host + '/api/reel/view/',
                  { $toString: '$_id' },
                ],
              },
            ],
          },
          thumbnail: { $concat: [config.host + '/thumbnail/', '$thumbnail'] },
          isLiked: { $in: [userId, { $ifNull: ['$likedBy', []] }] },
        },
      },
      { $limit: 5 },
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
          createdAt: 1,
          isLiked: 1,
          createdBy: {
            id: '$creator._id',
            name: '$creator.name',
            profile: {
              $cond: {
                if: {
                  $or: [
                    { $eq: ['$creator.profile', null] },
                    { $eq: ['$creator.profile', ''] },
                    { $not: ['$creator.profile'] },
                  ],
                },
                then: '$$REMOVE',
                else: {
                  $concat: [config.host + '/profile/', '$creator.profile'],
                },
              },
            },
          },
        },
      },
    ]);

    if (recommended.length > 0) {
      interestReels.push({
        category: {
          id: 'recommended',
          name: 'Recommended',
          image: config.host + '/category/default.jpg',
        },
        reels: recommended,
      });
    }
    const uniqueReelIds = new Set();

    const finalReels = interestReels.map((bucket: any) => {
      const uniqueReels: any[] = [];

      for (const reel of bucket.reels) {
        const reelId = reel.id.toString();
        if (!uniqueReelIds.has(reelId)) {
          uniqueReelIds.add(reelId);
          uniqueReels.push(reel);
        }
        if (uniqueReels.length >= 5) {
          break;
        }
      }

      return {
        ...bucket,
        reels: uniqueReels,
      };
    });

    res.json({ success: true, data: finalReels });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false });
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
    const userId = req.user.id;
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
    const userId = req.user.id;
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
    const userId = req.user.id;
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
    // const userId = req.user.id;
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

export const fetchReels = async (
  userId: string,
  matchQuery: any,
  options: { skip?: number; limit?: number; sortQuery?: any } = {}
) => {
  const { skip = 0, limit = 10, sortQuery = { createdAt: -1 } } = options;
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
    ...(sortQuery ? [{ $sort: sortQuery }] : [{ $sort: { createdAt: -1 } }]),
    ...(skip ? [{ $skip: skip }] : []),
    { $limit: limit },
  ]).exec();
  return results;
};
