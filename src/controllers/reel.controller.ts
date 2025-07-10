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
import { Category } from '../models/category.model';
import { config } from '../config/config';

export const getReels = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const removeReels = JSON.parse(req.query.reels || '[]');
    const matchQuery: any = { status: STATUS.active };

    if (removeReels.length) {
      matchQuery._id = {
        $nin: removeReels.map((id: string) => new ObjectId(id)),
      };
    }

    const total = await Reel.countDocuments(matchQuery);
    const reels = await Reel.aggregate([
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
          totalLikes: { $size: { $ifNull: ['$likedBy', []] } },
          totalComments: {
            $cond: [
              { $gt: [{ $size: '$commentStats' }, 0] },
              { $arrayElemAt: ['$commentStats.count', 0] },
              0,
            ],
          },
          totalViews: { $ifNull: ['$views', 0] },
        },
      },
      {
        $addFields: {
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
          thumbnail: {
            $concat: [config.host + '/thumbnail/', '$thumbnail'],
          },
          'createdBy.profile': {
            $concat: [config.host + '/profile/', '$createdBy.profile'],
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
            profile: '$createdBy.profile',
            id: '$createdBy._id',
          },
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
    ]);

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
    res.status(400).json({ success: false, message: error.message });
  }
});

export const dashboardReels = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const size = 5;
    const search = req.query.search || '';
    const searchRegex = new RegExp(search, 'i');

    const user = await User.findById(userId);
    const interestIds =
      user?.interests?.map((i: any) => new ObjectId(i.id)) || [];
    const result = await Reel.aggregate([
      {
        $facet: {
          interestCategoryReels: [
            {
              $match: {
                status: STATUS.active,
                categories: { $in: interestIds },
                caption: { $regex: searchRegex },
              },
            },
            {
              $addFields: {
                matchedCategories: {
                  $filter: {
                    input: '$categories',
                    cond: { $in: ['$$this', interestIds] },
                  },
                },
              },
            },
            {
              $addFields: {
                chosenCategory: { $arrayElemAt: ['$matchedCategories', 0] },
              },
            },
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
                  { $count: 'totalComments' },
                ],
                as: 'commentStats',
              },
            },
            {
              $addFields: {
                totalComments: {
                  $cond: [
                    { $gt: [{ $size: '$commentStats' }, 0] },
                    { $arrayElemAt: ['$commentStats.totalComments', 0] },
                    0,
                  ],
                },
              },
            },
            {
              $project: {
                _id: 0,
                id: '$_id',
                caption: 1,
                media: {
                  $cond: {
                    if: { $isArray: '$media' },
                    then: {
                      $map: {
                        input: '$media',
                        as: 'img',
                        in: { $concat: [config.host + '/reel/', '$$img'] },
                      },
                    },
                    else: {
                      $concat: [
                        config.host + '/api/reel/view/',
                        { $toString: '$_id' },
                      ],
                    },
                  },
                },
                duration: 1,
                thumbnail: {
                  $concat: [config.host + '/thumbnail/', '$thumbnail'],
                },
                totalViews: '$views',
                mediaType: 1,
                isLiked: { $in: [new ObjectId(userId), '$likedBy'] },
                totalLikes: { $size: '$likedBy' },
                categoryId: '$chosenCategory',
                totalComments: 1,
                createdAt: 1,
                createdBy: {
                  name: '$createdBy.name',
                  profile: {
                    $concat: [config.host + '/profile/', '$createdBy.profile'],
                  },
                  id: '$createdBy._id',
                },
              },
            },
            {
              $group: {
                _id: '$categoryId',
                reels: { $addToSet: '$$ROOT' },
              },
            },
            {
              $lookup: {
                from: 'categories',
                localField: '_id',
                foreignField: '_id',
                as: 'category',
              },
            },
            { $unwind: '$category' },
            {
              $project: {
                _id: 0,
                category: {
                  id: '$category._id',
                  name: '$category.name',
                  image: {
                    $concat: [config.host + '/category/', '$category.image'],
                  },
                },
                reels: {
                  $map: {
                    input: { $slice: ['$reels', size] },
                    as: 'reel',
                    in: {
                      id: '$$reel.id',
                      caption: '$$reel.caption',
                      media: '$$reel.media',
                      duration: '$$reel.duration',
                      thumbnail: '$$reel.thumbnail',
                      totalViews: '$$reel.totalViews',
                      mediaType: '$$reel.mediaType',
                      totalLikes: '$$reel.totalLikes',
                      totalComments: '$$reel.totalComments',
                      createdAt: '$$reel.createdAt',
                      createdBy: '$$reel.createdBy',
                      isLiked: '$$reel.isLiked',
                    },
                  },
                },
              },
            },
          ],
          allReels: [
            {
              $match: {
                status: STATUS.active,
                caption: { $regex: searchRegex },
                categories: { $not: { $elemMatch: { $in: interestIds } } },
              },
            },
            { $sort: { createdAt: -1 } },
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
                  { $count: 'totalComments' },
                ],
                as: 'commentStats',
              },
            },
            {
              $addFields: {
                totalComments: {
                  $cond: [
                    { $gt: [{ $size: '$commentStats' }, 0] },
                    { $arrayElemAt: ['$commentStats.totalComments', 0] },
                    0,
                  ],
                },
              },
            },
            {
              $project: {
                _id: 0,
                id: '$_id',
                caption: 1,
                media: {
                  $cond: {
                    if: { $isArray: '$media' },
                    then: {
                      $map: {
                        input: '$media',
                        as: 'img',
                        in: { $concat: [config.host + '/reel/', '$$img'] },
                      },
                    },
                    else: {
                      $concat: [
                        config.host + '/api/reel/view/',
                        { $toString: '$_id' },
                      ],
                    },
                  },
                },
                duration: 1,
                thumbnail: {
                  $concat: [config.host + '/thumbnail/', '$thumbnail'],
                },
                totalViews: '$views',
                mediaType: 1,
                totalLikes: { $size: '$likedBy' },
                totalComments: 1,
                createdAt: 1,
                isLiked: { $in: [new ObjectId(userId), '$likedBy'] },
                createdBy: {
                  name: '$createdBy.name',
                  profile: {
                    $concat: [config.host + '/profile/', '$createdBy.profile'],
                  },
                  id: '$createdBy._id',
                },
              },
            },
            { $limit: size },
          ],
        },
      },
    ]);

    const { interestCategoryReels, allReels } = result[0];

    const usedReelIds = new Set(
      interestCategoryReels.flatMap((cat: any) =>
        cat.reels.map((r: any) => r.id.toString())
      )
    );

    const recommendedReels = allReels.filter(
      (r: any) => !usedReelIds.has(r.id.toString())
    );

    if (recommendedReels.length) {
      interestCategoryReels.push({
        category: {
          id: 'recommended',
          name: 'Recommended',
          image: `${config.host}/category/default.jpg`,
        },
        reels: recommendedReels,
      });
    }

    res.status(200).json({ success: true, data: interestCategoryReels });
  } catch (error: any) {
    console.error('Error in dashboardReels:', error.message);
    res.status(400).json({ success: false, message: error.message });
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
      views: 0,
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
      .populate('likedBy', 'name profile');
    res.status(201).json({ success: true, data: populatedReel });
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
      message: 'like_unlike_success',
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

    await Reel.findByIdAndUpdate(reelId, {
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
    console.error('Video stream error:', error);
    res.status(500).json({ message: 'internal_server_error' });
  }
});
