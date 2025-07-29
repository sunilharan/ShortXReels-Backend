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

export const getReels = expressAsyncHandler(async (req: any, res) => {
  const userId = req.user.id;
  const savedReels = req.user.savedReels;
  const limit = parseInt(req.query.limit) || 10;
  const profileUserId = req.query.profileUserId || '';
  const removeReels = JSON.parse(req.query.removeReelIds || '[]');
  const categoryId = req.query.categoryId || '';
  const addReels = JSON.parse(req.query.addReelIds || '[]');

  const matchQuery: any = {
    status: STATUS_TYPE.active,
    createdBy: { $ne: new mongoose.Types.ObjectId(String(userId)) },
  };
  if (removeReels.length) {
    matchQuery._id = {
      $nin: removeReels.map(
        (id: string) => new mongoose.Types.ObjectId(String(id))
      ),
    };
  }

  let reels: any[] = [];
  let totalRecords = 0;

  if (addReels.length) {
    const addReelQuery = {
      _id: {
        $in: addReels.map(
          (id: string) => new mongoose.Types.ObjectId(String(id))
        ),
      },
    };
    reels = await fetchReels(
      userId,
      addReelQuery,
      { skip: 0, limit: addReels.length },
      savedReels
    );
  }

  if (profileUserId) {
    matchQuery.createdBy = new mongoose.Types.ObjectId(String(profileUserId));
    reels = [
      ...reels,
      ...(await fetchReels(userId, matchQuery, { skip: 0, limit }, savedReels)),
    ];

    totalRecords = await countActiveReelsWithActiveUsers(matchQuery);
  } else if (categoryId === 'recommended') {
    reels = [
      ...reels,
      ...(await fetchReels(userId, matchQuery, { skip: 0, limit }, savedReels)),
    ];

    totalRecords = await countActiveReelsWithActiveUsers(matchQuery);
  } else if (categoryId) {
    const primaryQuery = {
      ...matchQuery,
      categories: { $in: [new mongoose.Types.ObjectId(String(categoryId))] },
    };
    const primaryReels = await fetchReels(
      userId,
      primaryQuery,
      { skip: 0, limit },
      savedReels
    );
    reels = [...reels, ...primaryReels];

    totalRecords = await countActiveReelsWithActiveUsers(primaryQuery);

    if (reels.length < limit) {
      const fallbackQuery = {
        ...matchQuery,
        categories: { $nin: [new mongoose.Types.ObjectId(String(categoryId))] },
      };
      const fallbackLimit = limit - reels.length;
      reels = [
        ...reels,
        ...(await fetchReels(
          userId,
          fallbackQuery,
          { skip: 0, limit: fallbackLimit },
          savedReels
        )),
      ];
    }
  } else {
    reels = [
      ...reels,
      ...(await fetchReels(userId, matchQuery, { skip: 0, limit }, savedReels)),
    ];

    totalRecords = await countActiveReelsWithActiveUsers(matchQuery);
  }

  const reelsMap = new Map<string, any>();
  reels.forEach((reel) => reelsMap.set(reel.id.toString(), reel));
  const finalReels = Array.from(reelsMap.values()).slice(0, limit);

  res.status(200).json({
    success: true,
    data: {
      reels: finalReels,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
    },
  });
});

export const getReelsByUser = expressAsyncHandler(async (req: any, res) => {
  const userId = req.user.id;
  const savedReels = req.user.savedReels;
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
    throw new Error('invalid_request');
  }
  const user = await User.findById(id).select(
    'id name email phone gender birth status profile displayName description'
  );
  if (!user || user.status !== STATUS_TYPE.active) {
    res.status(404);
    throw new Error('user_not_found');
  }
  const matchQuery = {
    createdBy: new mongoose.Types.ObjectId(String(user.id)),
    status: STATUS_TYPE.active,
  };
  const total = await Reel.countDocuments(matchQuery);
  const reels = await fetchReels(
    userId,
    matchQuery,
    {
      skip,
      limit,
      sortQuery,
    },
    savedReels
  );

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
    const userId = new mongoose.Types.ObjectId(String(req.user.id));
    const savedReels = req.user.savedReels || [];
    const user = await User.findById(userId).select('interests').lean();
    const interestIds =
      user?.interests.map((i: any) => new mongoose.Types.ObjectId(i.id)) || [];
    const interestReels = await Reel.aggregate([
      {
        $match: {
          status: STATUS_TYPE.active,
          createdBy: { $ne: userId },
          categories: { $in: interestIds },
        },
      },
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
                $expr: { $eq: ['$reel', '$$id'] },
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
              isSaved: '$isSaved',
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
      {
        $match: {
          status: STATUS_TYPE.active,
          categories: { $nin: interestIds },
          createdBy: { $ne: new mongoose.Types.ObjectId(String(userId)) },
        },
      },
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
                $expr: { $eq: ['$reel', '$$id'] },
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
                (id: string) => new mongoose.Types.ObjectId(String(id))
              ),
            ],
          },
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
          isSaved: 1,
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

    res.json({ success: true, data: finalReels });
  } catch (error) {
    throw error;
  }
});

export const allReels = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const savedReels = req?.user?.savedReels;
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(req.query.page) || 1;
    const skip = (page - 1) * limit;
    const sortOrder = req.query.sortOrder;
    const sortBy = req.query.sortBy;
    const status = req.query.status;
    const search = req.query.search;
    const category = req.query.category;
    const createdBy = req.query.createdBy;
    let matchQuery: any = {};
    let sortQuery: any = {};
    if (
      sortOrder &&
      sortBy &&
      (sortOrder === 'asc' || sortOrder === 'desc') &&
      (sortBy === 'createdAt' ||
        sortBy === 'totalViews' ||
        sortBy === 'totalLikes' ||
        sortBy === 'totalComments')
    ) {
      sortQuery = {
        [sortBy]: sortOrder === 'asc' ? 1 : -1,
      };
    } else {
      sortQuery = { createdAt: -1 };
    }
    if (status) {
      matchQuery.status = status;
    }
    if (search) {
      matchQuery.caption = { $regex: search, $options: 'i' };
    }
    if (category) {
      matchQuery.categories = { $in: [new mongoose.Types.ObjectId(category)] };
    }
    if (createdBy) {
      matchQuery.createdBy = new mongoose.Types.ObjectId(createdBy);
    }
    const reels = await fetchReels(
      userId,
      matchQuery,
      { skip, limit, sortQuery },
      savedReels
    );
    const totalRecords = await countActiveReelsWithActiveUsers(matchQuery);

    res.status(200).json({
      success: true,
      data: reels,
      totalRecords,
      totalPages: Math.ceil(totalRecords / limit),
    });
  } catch (error: any) {
    throw error;
  }
});

export const createReel = expressAsyncHandler(async (req: any, res) => {
  try {
    const {
      caption,
      categories: rawCategories,
      mediaType,
      duration,
    } = req.body;
    const files = req.files || {};
    const userId = req.user.id;

    const categories = JSON.parse(rawCategories).map(
      (id: string) => new mongoose.Types.ObjectId(id)
    );
    const reelData: any = {
      createdBy: new mongoose.Types.ObjectId(userId),
      caption,
      categories,
      mediaType,
    };

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
    reelData.updatedBy = userId;

    const reel = await Reel.create(reelData);
    const populated = await Reel.findById(reel.id)
      .populate('createdBy', 'name profile')
      .populate('categories', 'name image')
      .populate('likedBy', 'name profile')
      .populate('viewedBy', 'name profile')
      .exec();

    res.status(201).json({ success: true, data: populated });
  } catch (error: any) {
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
  } catch (error: any) {
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
  } catch (error: any) {
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
  } catch (error: any) {
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
    const reel = await Reel.findById(id);
    if (!reel) throw new Error('reel_not_found');
    await Reel.findByIdAndUpdate(id, {
      status,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    });
    res.status(200).json({
      success: true,
      message: t('status_changed'),
    });
  } catch (error: any) {
    throw error;
  }
});

export const blockReel = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.body;
    if (!id) {
      throw new Error('invalid_request');
    }
    const reel = await Reel.findById(id);
    if (!reel) throw new Error('reel_not_found');
    await Reel.findByIdAndUpdate(id, {
      status: STATUS_TYPE.blocked,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    });
    res.status(200).json({
      success: true,
      message: t('data_blocked'),
    });
  } catch (error: any) {
    throw error;
  }
});

export const fetchReels = async (
  userId: string,
  matchQuery: any,
  options: { skip?: number; limit?: number; sortQuery?: any } = {},
  savedReels: any = []
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
      $match: { 'createdBy.status': STATUS_TYPE.active },
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
            $match: {
              'commentedByUser.status': STATUS_TYPE.active,
            },
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

export const countActiveReelsWithActiveUsers = async (query: any) => {
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
    {
      $match: {
        'createdBy.status': STATUS_TYPE.active,
      },
    },
    { $count: 'total' },
  ]).exec();
  return result[0]?.total || 0;
};
