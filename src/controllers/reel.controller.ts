import expressAsyncHandler from 'express-async-handler';
import path, { join } from 'path';
import { REEL_FOLDER, UserRole } from '../config/constants';
import { STATUS_TYPE, SORT_TYPE, MEDIA_TYPE, LIKE_TYPE } from '../config/enums';
import { Reel } from '../models/reel.model';
import { t } from 'i18next';
import mongoose from 'mongoose';
import { createReadStream, existsSync, rename, statSync } from 'fs';
import { User } from '../models/user.model';
import { config } from '../config/config';
import { parseISO, isValid, startOfDay, endOfDay } from 'date-fns';
import { yearMonthChartAggregation } from './common.controller';

export const getReels = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const savedReels = req.user.savedReels;
    const limit = parseInt(req.query.limit) || 10;
    const profileUserId = req.query.profileUserId || '';
    const removeReels = JSON.parse(req.query.removeReelIds || '[]');
    const categoryId = req.query.categoryId || '';
    const addReels = JSON.parse(req.query.addReelIds || '[]');
    const role = req.role;

    const matchQuery: any = { status: STATUS_TYPE.active };

    if (role === UserRole.User) {
      matchQuery.createdBy = {
        $ne: new mongoose.Types.ObjectId(String(userId)),
      };
    } else if (role === UserRole.Admin || role === UserRole.SuperAdmin) {
      if (categoryId && categoryId !== 'recommended') {
        matchQuery.categories = {
          $in: [new mongoose.Types.ObjectId(String(categoryId))],
        };
      }
    }
    let totalRecords = await countActiveReelsWithActiveUsers(matchQuery, true);

    if (removeReels.length) {
      matchQuery._id = {
        $nin: removeReels.map(
          (id: string) => new mongoose.Types.ObjectId(String(id))
        ),
      };
    }

    const reelsMap = new Map<string, any>();
    const addUniqueReels = (newReels: any[]) => {
      newReels.forEach((r) => reelsMap.set(r.id.toString(), r));
    };

    if (addReels.length) {
      const addReelQuery = {
        _id: {
          $in: addReels.map(
            (id: string) => new mongoose.Types.ObjectId(String(id))
          ),
        },
      };
      const addResults = await fetchReels(
        userId,
        addReelQuery,
        { skip: 0, limit: addReels.length, addCategories: true },
        savedReels
      );
      addUniqueReels(addResults);
    }

    let primaryResults: any[] = [];
    if (profileUserId) {
      matchQuery.createdBy = new mongoose.Types.ObjectId(String(profileUserId));
      primaryResults = await fetchReels(
        userId,
        matchQuery,
        { skip: 0, limit, addCategories: true },
        savedReels
      );
      totalRecords = await countActiveReelsWithActiveUsers(matchQuery, true);
    } else if (categoryId === 'recommended') {
      primaryResults = await fetchReels(
        userId,
        matchQuery,
        { skip: 0, limit, addCategories: true },
        savedReels
      );
    } else if (categoryId) {
      const primaryQuery = {
        ...matchQuery,
        categories: { $in: [new mongoose.Types.ObjectId(String(categoryId))] },
      };
      primaryResults = await fetchReels(
        userId,
        primaryQuery,
        { skip: 0, limit, addCategories: true },
        savedReels
      );
    } else {
      primaryResults = await fetchReels(
        userId,
        matchQuery,
        { skip: 0, limit, addCategories: true },
        savedReels
      );
    }

    addUniqueReels(primaryResults);

    if (categoryId && role === UserRole.User && reelsMap.size < limit) {
      const fallbackQuery = {
        ...matchQuery,
        categories: { $nin: [new mongoose.Types.ObjectId(String(categoryId))] },
      };
      const remaining = limit - reelsMap.size;
      const fallbackResults = await fetchReels(
        userId,
        fallbackQuery,
        { skip: 0, limit: remaining, addCategories: true },
        savedReels
      );
      addUniqueReels(fallbackResults);
    }

    const finalReels = Array.from(reelsMap.values()).slice(0, limit);

    res.status(200).json({
      success: true,
      data: {
        reels: finalReels,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
      },
    });
  } catch (error) {
    throw error;
  }
});

export const getReelsByUser = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const savedReels = req.user.savedReels;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const id = req.query.userId;
    const sortType = req.query.sortType;
    const sortQuery: any = {};
    if (sortType === SORT_TYPE.popular) {
      sortQuery.totalViews = -1;
      sortQuery.totalLikes = -1;
      sortQuery.totalComments = -1;
      sortQuery.createdAt = -1;
    } else if (sortType === SORT_TYPE.latest) {
      sortQuery.createdAt = -1;
    } else if (sortType === SORT_TYPE.oldest) {
      sortQuery.createdAt = 1;
    } else {
      sortQuery.createdAt = -1;
    }
    if (!id) {
      res.status(400);
      throw new Error('invalid_request');
    }
    const user = await User.findById(id)
      .select(
        'id name email phone gender birth status profile displayName description'
      )
      .exec();
    if (!user || user.status !== STATUS_TYPE.active) {
      res.status(404);
      throw new Error('user_not_found');
    }
    const matchQuery = {
      createdBy: new mongoose.Types.ObjectId(String(user.id)),
      status: STATUS_TYPE.active,
    };
    const total = await Reel.countDocuments(matchQuery).exec();
    const reels = await fetchReels(
      userId,
      matchQuery,
      {
        skip,
        limit,
        sortQuery,
        addCategories: true,
      },
      savedReels
    );

    res.status(200).json({
      success: true,
      data: {
        ...user?.toJSON(),
        reels,
        totalRecords: total,
        totalReels: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    throw error;
  }
});

export const dashboardReels = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(String(req.user.id));
    const savedReels = req.user.savedReels;
    const interestIds = req.user?.interests || [];
    const commonAggregation: any = [
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
        $match: {
          'creator.status': STATUS_TYPE.active,
        },
      },
      {
        $lookup: {
          from: 'comments',
          let: { id: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$reel', '$$id'] },
                    { $eq: ['$status', STATUS_TYPE.active] },
                  ],
                },
              },
            },
            {
              $lookup: {
                from: 'users',
                localField: 'commentedBy',
                foreignField: '_id',
                as: 'commentedByUser',
              },
            },
            { $unwind: '$commentedByUser' },
            {
              $match: {
                'commentedByUser.status': STATUS_TYPE.active,
              },
            },
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
          isSaved: {
            $in: [
              '$_id',
              savedReels.map(
                (id: any) => new mongoose.Types.ObjectId(String(id))
              ),
            ],
          },
        },
      },
    ];
    const interestReels = await Reel.aggregate([
      {
        $match: {
          status: STATUS_TYPE.active,
          createdBy: { $ne: userId },
          categories: { $in: interestIds },
        },
      },
      { $unwind: '$categories' },
      { $match: { categories: { $in: interestIds } } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'categories',
          localField: 'categories',
          foreignField: '_id',
          as: 'catInfo',
        },
      },
      { $unwind: '$catInfo' },
      ...commonAggregation,
      {
        $group: {
          _id: '$categories',
          name: { $first: '$catInfo.name' },
          image: { $first: '$catInfo.image' },
          reels: {
            $push: {
              id: '$_id',
              caption: '$caption',
              description: '$description',
              mediaType: '$mediaType',
              media: '$media',
              duration: '$duration',
              thumbnail: '$thumbnail',
              totalViews: '$totalViews',
              totalLikes: '$totalLikes',
              totalComments: '$totalComments',
              createdAt: '$createdAt',
              isLiked: '$isLiked',
              isSaved: '$isSaved',
              createdBy: {
                id: '$creator._id',
                name: '$creator.name',
                displayName: '$creator.displayName',
                profile: {
                  $cond: {
                    if: { $not: ['$creator.profile'] },
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
    ]).exec();

    const recommended = await Reel.aggregate([
      {
        $match: {
          status: STATUS_TYPE.active,
          categories: { $nin: interestIds },
          createdBy: { $ne: new mongoose.Types.ObjectId(String(userId)) },
        },
      },
      { $sort: { createdAt: -1 } },
      ...commonAggregation,
      { $limit: 5 },
      {
        $project: {
          _id: 0,
          id: '$_id',
          caption: 1,
          description: 1,
          media: 1,
          mediaType: 1,
          duration: 1,
          thumbnail: 1,
          totalViews: 1,
          totalLikes: 1,
          totalComments: 1,
          createdAt: 1,
          isLiked: 1,
          isSaved: 1,
          createdBy: {
            id: '$creator._id',
            name: '$creator.name',
            displayName: '$creator.displayName',
            profile: {
              $cond: {
                if: { $not: ['$creator.profile'] },
                then: '$$REMOVE',
                else: {
                  $concat: [config.host + '/profile/', '$creator.profile'],
                },
              },
            },
          },
        },
      },
    ]).exec();

    if (recommended.length > 0) {
      interestReels.push({
        category: {
          id: 'recommended',
          name: 'Recommended',
        },
        reels: recommended,
      });
    }
    const uniqueReelIds = new Set();

    const finalReels = interestReels
      .map((bucket: any) => {
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
      })
      .filter((bucket: any) => bucket.reels.length > 0);

    res.status(200).json({ success: true, data: finalReels });
  } catch (error) {
    throw error;
  }
});

async function getReelsByRole(req: any, res: any, role?: string) {
  try {
    const userId = req.user.id;
    const savedReels = req?.user?.savedReels;
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const sortOrder = req.query.sortOrder;
    const sortBy = req.query.sortBy;
    const status = req.query.status;
    const search = (
      typeof req?.query?.search === 'string' ? req?.query?.search : ''
    ).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const category = req.query.category;
    const createdBy = req.query.createdBy;
    const startDate = req.query.startDate
      ? parseISO(req.query.startDate)
      : null;
    const endDate = req.query.endDate ? parseISO(req.query.endDate) : null;
    const matchQuery: any = {};
    const sortQuery: any = {};
    if (
      sortOrder &&
      sortBy &&
      (sortOrder === 'asc' || sortOrder === 'desc') &&
      [
        'createdAt',
        'updatedAt',
        'totalViews',
        'totalLikes',
        'totalComments',
      ].includes(sortBy)
    ) {
      sortQuery[sortBy] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortQuery.createdAt = -1;
    }
    if (status) {
      matchQuery.status = status;
    }
    if (search) {
      matchQuery.caption = { $regex: search, $options: 'i' };
      matchQuery.description = { $regex: search, $options: 'i' };
    }
    if (category) {
      matchQuery.categories = {
        $in: [new mongoose.Types.ObjectId(String(category))],
      };
    }
    if (createdBy) {
      matchQuery.createdBy = new mongoose.Types.ObjectId(String(createdBy));
    }
    const isStartValid = startDate && isValid(startDate);
    const isEndValid = endDate && isValid(endDate);

    if (isStartValid && isEndValid) {
      matchQuery.createdAt = { $gte: startDate, $lte: endDate };
    } else if (isStartValid) {
      matchQuery.createdAt = {
        $gte: startOfDay(startDate),
        $lte: endOfDay(startDate),
      };
    }
    if (role === UserRole.User) {
      matchQuery.isAdmin = false;
    } else {
      matchQuery.isAdmin = true;
    }
    const reels = await fetchReels(
      userId,
      matchQuery,
      {
        skip,
        limit,
        sortQuery,
        addCategories: true,
        addStatus: true,
      },
      savedReels
    );

    const totalRecords = await countActiveReelsWithActiveUsers(matchQuery);
    res.status(200).json({
      success: true,
      data: {
        reels,
        totalRecords,
        totalPages: Math.ceil(totalRecords / limit),
      },
    });
  } catch (error) {
    throw error;
  }
}

export const userReels = expressAsyncHandler(async (req: any, res) => {
  try {
    await getReelsByRole(req, res, UserRole.User);
  } catch (error) {
    throw error;
  }
});

export const adminReels = expressAsyncHandler(async (req: any, res) => {
  try {
    await getReelsByRole(req, res);
  } catch (error) {
    throw error;
  }
});

export const createReel = expressAsyncHandler(async (req: any, res) => {
  try {
    const {
      caption,
      description,
      categories: rawCategories,
      mediaType,
      duration,
    } = req.body;
    const files = req.files || {};
    const userId = req.user.id;
    const role = req.role;
    const categories = JSON.parse(rawCategories).map(
      (id: any) => new mongoose.Types.ObjectId(String(id))
    );
    const reelData: any = {};
    if (caption) {
      reelData.caption = caption;
    }
    if (description) {
      reelData.description = description;
    }
    if (categories) {
      reelData.categories = categories;
    }
    if (mediaType) {
      reelData.mediaType = mediaType;
    }
    if (duration) {
      reelData.duration = duration;
    }
    reelData.createdBy = new mongoose.Types.ObjectId(String(userId));

    const mediaFiles = files.media || [];
    const thumbnail = files.thumbnail?.[0];

    const moveFile = (file: any, subfolder: string) => {
      const mediaPath = `${subfolder}/${file.filename}`;
      const dest = `files/${mediaPath}`;
      rename(file.path, dest, (err) => {
        if (err) throw err;
      });
      return file.filename;
    };

    if (mediaType === MEDIA_TYPE.video) {
      reelData.media = moveFile(mediaFiles[0], 'reels');
      reelData.duration = parseFloat(duration) || 0;
    } else {
      reelData.media = mediaFiles.map((f: any) => moveFile(f, 'reels'));
    }

    if (thumbnail) {
      reelData.thumbnail = moveFile(thumbnail, 'thumbnails');
    }

    if (role === UserRole.Admin || role === UserRole.SuperAdmin) {
      reelData.isAdmin = true;
    }
    reelData.updatedBy = userId;

    const reel = await Reel.create(reelData);

    const populated = await reel.populate([
      { path: 'createdBy', select: 'name profile displayName' },
      { path: 'categories', select: 'name image' },
      { path: 'likedBy', select: 'name profile displayName' },
      { path: 'viewedBy', select: 'name profile displayName' },
    ]);
    res.status(201).json({
      success: true,
      data: {
        ...populated?.toJSON(),
        totalViews: 0,
        totalLikes: 0,
        totalComments: 0,
      },
    });
  } catch (error) {
    throw error;
  }
});

export const deleteReel = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const role = req.role;
    const { id } = req.params;

    if (!id) {
      res.status(400);
      throw new Error('invalid_request');
    }

    let reel;
    if (role === UserRole.Admin || role === UserRole.SuperAdmin) {
      reel = await Reel.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(String(id)),
        },
        {
          $set: {
            status: STATUS_TYPE.deleted,
            updatedBy: userId,
            updatedAt: new Date().toISOString(),
          },
        }
      ).exec();
    } else {
      reel = await Reel.findOneAndUpdate(
        {
          createdBy: new mongoose.Types.ObjectId(String(userId)),
          _id: new mongoose.Types.ObjectId(String(id)),
        },
        {
          $set: {
            status: STATUS_TYPE.deleted,
            updatedBy: userId,
            updatedAt: new Date().toISOString(),
          },
        }
      ).exec();
    }
    if (!reel) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    res.status(200).json({
      success: true,
      message: t('reel_deleted'),
    });
  } catch (error) {
    throw error;
  }
});

export const likeUnlikeReel = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id, action } = req.body;

    if (!id) {
      res.status(400);
      throw new Error('invalid_request');
    }
    if (!action || (action !== LIKE_TYPE.like && action !== LIKE_TYPE.unlike)) {
      res.status(400);
      throw new Error('invalid_action');
    }
    let reel;
    const reelDoc = await Reel.findById(id).exec();
    if (reelDoc?.status !== STATUS_TYPE.active) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    if (!reelDoc) {
      reel = null;
    } else {
      const alreadyLiked = reelDoc.likedBy.some(
        (id: any) => id.toString() === userId
      );
      if (action === LIKE_TYPE.like) {
        if (!alreadyLiked) {
          reel = await Reel.findByIdAndUpdate(
            id,
            {
              $addToSet: {
                likedBy: new mongoose.Types.ObjectId(String(userId)),
              },
            },
            { new: true }
          ).exec();
        } else {
          reel = reelDoc;
        }
      } else if (action === LIKE_TYPE.unlike) {
        if (alreadyLiked) {
          reel = await Reel.findByIdAndUpdate(
            id,
            { $pull: { likedBy: new mongoose.Types.ObjectId(String(userId)) } },
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
        totalLikes: reel.likedBy.length,
        isLiked: reel.likedBy.some((id: any) => id.toString() === userId),
      },
      message: t('like_unlike_success'),
    });
  } catch (error) {
    throw error;
  }
});

export const streamReelVideo = expressAsyncHandler(async (req: any, res) => {
  try {
    const reelId = req.params.id;
    const role = req.role;
    if (!reelId) {
      res.status(400);
      throw new Error('invalid_request');
    }
    let reel;
    if (role === UserRole.Admin || role === UserRole.SuperAdmin) {
      reel = await Reel.findOne({
        _id: new mongoose.Types.ObjectId(String(reelId)),
      }).exec();
    } else {
      reel = await Reel.findOne({
        _id: new mongoose.Types.ObjectId(String(reelId)),
        status: STATUS_TYPE.active,
      }).exec();
    }
    if (!reel) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    if (reel.mediaType !== MEDIA_TYPE.video || !reel.media) {
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
        'Content-Disposition': `inline; filename='${reel.caption}${path.extname(
          (reel.media as string) || ''
        )}'`,
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

export const viewReel = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const reelId = new mongoose.Types.ObjectId(String(req.params.id));
    if (!reelId) {
      res.status(400);
      throw new Error('invalid_request');
    }
    let reel = await Reel.findOne({
      _id: reelId,
      status: STATUS_TYPE.active,
    }).exec();
    if (!reel) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    const isViewed = reel.viewedBy.some((id: any) => id.toString() === userId);
    if (!isViewed) {
      reel = await Reel.findByIdAndUpdate(reelId, {
        $push: { viewedBy: new mongoose.Types.ObjectId(String(userId)) },
      }).exec();
    }
    res.status(200).json({
      success: true,
      message: t('reel_viewed'),
    });
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
    const reel = await Reel.findById(id).exec();
    if (!reel) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    await Reel.findByIdAndUpdate(id, {
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

export const blockUnblockReel = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id, isBlocked } = req.body;
    if (!id || typeof isBlocked !== 'boolean') {
      throw new Error('invalid_request');
    }
    const reel = await Reel.findById(id).exec();
    if (!reel) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    if (Boolean(isBlocked) === true) {
      if (reel.status === STATUS_TYPE.blocked) {
        res.status(409);
        throw new Error('data_already_blocked');
      }
      await Reel.findByIdAndUpdate(id, {
        status: STATUS_TYPE.blocked,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      }).exec();
    } else if (Boolean(isBlocked) === false) {
      if (reel.status !== STATUS_TYPE.blocked) {
        res.status(409);
        throw new Error('data_not_blocked');
      }
      await Reel.findByIdAndUpdate(id, {
        status: STATUS_TYPE.active,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      }).exec();
    }
    res.status(200).json({
      success: true,
      message: t(Boolean(isBlocked) ? 'data_blocked' : 'data_unblocked'),
    });
  } catch (error) {
    throw error;
  }
});

export const topReelsAggregation = (
  userId: string,
  savedReels: string[]
): any[] => {
  const reelAggregation = [
    {
      $match: {
        status: STATUS_TYPE.active,
      },
    },
    {
      $lookup: {
        from: 'comments',
        let: { reelId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$reel', '$$reelId'] },
                  { $eq: ['$status', STATUS_TYPE.active] },
                ],
              },
            },
          },
          {
            $lookup: {
              from: 'users',
              localField: 'commentedBy',
              foreignField: '_id',
              as: 'commentedByUser',
            },
          },
          { $unwind: '$commentedByUser' },
          {
            $match: { 'commentedByUser.status': STATUS_TYPE.active },
          },
          { $count: 'count' },
        ],
        as: 'commentStats',
      },
    },
    {
      $addFields: {
        isLiked: { $in: [userId, { $ifNull: ['$likedBy', []] }] },
        isSaved: {
          $in: [
            '$_id',
            savedReels.map(
              (id: any) => new mongoose.Types.ObjectId(String(id))
            ),
          ],
        },
        totalLikes: { $size: { $ifNull: ['$likedBy', []] } },
        totalViews: { $size: { $ifNull: ['$viewedBy', []] } },
        totalComments: {
          $cond: [
            { $gt: [{ $size: '$commentStats' }, 0] },
            { $arrayElemAt: ['$commentStats.count', 0] },
            0,
          ],
        },
      },
    },
    {
      $addFields: {
        engagementScore: {
          $cond: {
            if: { $eq: ['$totalViews', 0] },
            then: 0,
            else: {
              $divide: [
                { $sum: ['$totalComments', '$totalLikes'] },
                '$totalViews',
              ],
            },
          },
        },
      },
    },
    {
      $sort: {
        // engagementScore: -1,
        totalLikes: -1,
        totalViews: -1,
        totalComments: -1,
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
    {
      $unwind: '$createdBy',
    },
    {
      $match: {
        'createdBy.status': STATUS_TYPE.active,
      },
    },
    {
      $lookup: {
        from: 'categories',
        localField: 'categories',
        foreignField: '_id',
        as: 'categories',
      },
    },
    {
      $project: {
        _id: 0,
        id: '$_id',
        caption: 1,
        description: 1,
        isLiked: 1,
        isSaved: 1,
        totalLikes: 1,
        totalViews: 1,
        totalComments: 1,
        engagementScore: 1,
        mediaType: 1,
        status: 1,
        categories: {
          $map: {
            input: '$categories',
            as: 'category',
            in: {
              id: '$$category._id',
              name: '$$category.name',
              image: {
                $concat: [config.host + '/category/', '$$category.image'],
              },
            },
          },
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
        createdBy: {
          id: '$createdBy._id',
          name: '$createdBy.name',
          displayName: '$createdBy.displayName',
          profile: {
            $cond: {
              if: { $not: ['$createdBy.profile'] },
              then: '$$REMOVE',
              else: {
                $concat: [config.host + '/profile/', '$createdBy.profile'],
              },
            },
          },
        },
      },
    },
  ];
  return reelAggregation;
};

export const topReels = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const savedReels = req.user.savedReels;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const matchQuery: any = {};
    const startDate = req.query.startDate
      ? parseISO(req.query.startDate)
      : null;
    const endDate = req.query.endDate ? parseISO(req.query.endDate) : null;
    const isStartValid = startDate && isValid(startDate);
    const isEndValid = endDate && isValid(endDate);

    if (isStartValid && isEndValid) {
      matchQuery.createdAt = { $gte: startDate, $lte: endDate };
    } else if (isStartValid) {
      matchQuery.createdAt = {
        $gte: startOfDay(startDate),
        $lte: endOfDay(startDate),
      };
    }
    const reelsAgg = topReelsAggregation(userId, savedReels);
    const reelsData = await Reel.aggregate([
      {
        $match: matchQuery,
      },
      {
        $facet: {
          topReels: [
            ...reelsAgg,
            {
              $skip: skip,
            },
            {
              $limit: limit,
            },
          ],
          pagination: [
            {
              $count: 'total',
            },
          ],
        },
      },
    ]).exec();
    const reels = reelsData[0]?.topReels || [];
    const totalRecords = reelsData[0]?.pagination[0]?.total || 0;
    const totalPages = Math.ceil(totalRecords / limit) || 0;
    res.status(200).json({
      success: true,
      data: {
        reels,
        totalRecords,
        totalPages,
      },
    });
  } catch (error) {
    throw error;
  }
});

export const reelsYearMonthChart = expressAsyncHandler(
  async (req: any, res) => {
    try {
      const year = req.query.year;
      const aggregation = yearMonthChartAggregation(year);
      const data = await Reel.aggregate(aggregation).exec();

      res.status(200).json({
        success: true,
        data,
      });
    } catch (error) {
      throw error;
    }
  }
);

export const fetchReels = async (
  userId: string,
  matchQuery: any,
  options: {
    skip?: number;
    limit?: number;
    sortQuery?: any;
    onlyActive?: boolean;
    addCategories?: boolean;
    addStatus?: boolean;
    role?: string;
  } = {},
  savedReels: any = []
) => {
  const {
    skip = 0,
    limit = 10,
    sortQuery = { createdAt: -1 },
    onlyActive = true,
    addCategories = false,
    addStatus = false,
    role,
  } = options;

  const roleMatch = role ? { 'role.name': role } : {};
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
        from: 'roles',
        localField: 'createdBy.role',
        foreignField: '_id',
        as: 'role',
      },
    },
    { $unwind: '$role' },
    { $match: onlyActive ? { 'createdBy.status': STATUS_TYPE.active } : {} },
    { $match: roleMatch },
    {
      $lookup: {
        from: 'comments',
        let: { reelId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$reel', '$$reelId'] },
                  ...(onlyActive
                    ? [{ $eq: ['$status', STATUS_TYPE.active] }]
                    : []),
                ],
              },
            },
          },
          {
            $lookup: {
              from: 'users',
              localField: 'commentedBy',
              foreignField: '_id',
              as: 'commentedByUser',
            },
          },
          { $unwind: '$commentedByUser' },
          {
            $match: onlyActive
              ? { 'commentedByUser.status': STATUS_TYPE.active }
              : {},
          },
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
      $lookup: {
        from: 'categories',
        localField: 'categories',
        foreignField: '_id',
        as: 'categories',
      },
    },
    {
      $project: {
        _id: 0,
        id: '$_id',
        caption: 1,
        description: 1,
        media: 1,
        mediaType: 1,
        duration: 1,
        thumbnail: 1,
        totalViews: 1,
        totalLikes: 1,
        totalComments: 1,
        status: addStatus ? '$status' : '$$REMOVE',
        categories: addCategories
          ? {
              $map: {
                input: '$categories',
                as: 'category',
                in: {
                  id: '$$category._id',
                  name: '$$category.name',
                  image: {
                    $concat: [config.host + '/category/', '$$category.image'],
                  },
                },
              },
            }
          : '$$REMOVE',
        isLiked: {
          $in: [new mongoose.Types.ObjectId(String(userId)), '$likedBy'],
        },
        isSaved: {
          $in: [
            '$_id',
            savedReels.map(
              (id: any) => new mongoose.Types.ObjectId(String(id))
            ),
          ],
        },
        createdAt: 1,
        createdBy: {
          name: '$createdBy.name',
          displayName: '$createdBy.displayName',
          profile: {
            $cond: {
              if: { $not: ['$createdBy.profile'] },
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

export const countActiveReelsWithActiveUsers = async (
  query?: any,
  onlyActive?: boolean
) => {
  const result = await Reel.aggregate([
    { $match: query },
    {
      $lookup: {
        from: 'users',
        localField: 'createdBy',
        foreignField: '_id',
        as: 'createdBy',
      },
    },
    { $unwind: '$createdBy' },
    { $match: onlyActive ? { 'createdBy.status': STATUS_TYPE.active } : {} },
    { $count: 'total' },
  ]).exec();

  return result[0]?.total || 0;
};
