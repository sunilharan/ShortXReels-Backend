import expressAsyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import { AES, enc, mode, pad } from 'crypto-js';
import { config } from '../config/config';
import { decryptData } from '../utils/encrypt';
import { Role } from '../models/role.model';
import { MEDIA_TYPE, REPORT_STATUS, REPORT_TYPE, STATUS_TYPE } from '../config/enums';
import { Reel } from '../models/reel.model';
import { Report } from '../models/report.model';
import { UserRole } from '../config/constants';
import { User } from '../models/user.model';
import {
  startOfYear,
  endOfYear,
  format,
  getYear,
  subMonths,
  endOfMonth,
  startOfMonth,
} from 'date-fns';
import { topUsersAggregation } from './user.controller';
import { topReelsAggregation } from './reel.controller';

export const getEncodeData = expressAsyncHandler(async (req: any, res) => {
  const key = enc.Utf8.parse(config.aesKey);
  const iv = enc.Utf8.parse(config.aesIv);
  const val = req.body.data;
  const cipher = AES.encrypt(val, key, {
    iv: iv,
    mode: mode.CBC,
    padding: pad.Pkcs7,
  });
  const buff = enc.Base64.parse(cipher.toString());
  const decipher = AES.decrypt({ ciphertext: buff } as any, key, {
    iv: iv,
    mode: mode.CBC,
    padding: pad.Pkcs7,
  });
  const decrypted = decipher.toString(enc.Utf8);
  res.status(200).send({
    success: true,
    data: {
      encData: cipher.toString(),
      decData: decrypted,
    },
    message: '',
  });
});

export const getDecodedData = expressAsyncHandler(async (req: any, res) => {
  try {
    const { data } = req.body;
    res.status(200).send({
      success: true,
      data: decryptData(data),
      message: '',
    });
  } catch (error) {
    throw error;
  }
});

export const getRoles = expressAsyncHandler(async (_, res) => {
  try {
    const roles = await Role.find().exec();
    res.status(200).send({
      success: true,
      data: roles,
    });
  } catch (error) {
    throw error;
  }
});

export const checkHealth = expressAsyncHandler(async (_, res) => {
  const mongoState = mongoose.connection.readyState;
  const mongoStates = [
    'disconnected',
    'connected',
    'connecting',
    'disconnecting',
  ];
  const isHealthy = mongoState === 1;
  const success = isHealthy ? true : false;
  const status = isHealthy ? 200 : 503;
  res.status(status).json({
    success,
    server: {
      status: 'running',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
    database: {
      type: 'MongoDB',
      status: mongoStates[mongoState],
    },
  });
});

export const yearMonthChartAggregation = (year?: number): any[] => {
  const findYear = year ? year : getYear(new Date());

  const startDate = startOfYear(new Date(findYear, 0));
  const endDate = endOfYear(new Date(findYear, 0));

  const monthOrder = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(findYear, index, 1);
    return {
      monthNumber: index + 1,
      month: format(date, 'MMMM'),
    };
  });

  const aggregation = [
    {
      $match: {
        createdAt: { $gte: startDate, $lt: endDate },
        status: { $in: [STATUS_TYPE.active, STATUS_TYPE.blocked] },
      },
    },
    {
      $group: {
        _id: { $month: '$createdAt' },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        monthNumber: '$_id',
        count: 1,
      },
    },
    {
      $group: {
        _id: null,
        data: { $push: '$$ROOT' },
      },
    },
    {
      $addFields: {
        months: monthOrder,
      },
    },
    {
      $project: {
        merged: {
          $map: {
            input: '$months',
            as: 'm',
            in: {
              month: '$$m.month',
              order: '$$m.monthNumber',
              count: {
                $let: {
                  vars: {
                    matched: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$data',
                            as: 'd',
                            cond: {
                              $eq: ['$$d.monthNumber', '$$m.monthNumber'],
                            },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: { $ifNull: ['$$matched.count', 0] },
                },
              },
            },
          },
        },
      },
    },
    { $unwind: '$merged' },
    { $replaceRoot: { newRoot: '$merged' } },
    { $sort: { order: 1 } },
  ];

  return aggregation;
};

export const adminDashboardDetails = expressAsyncHandler(
  async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit) || 5;
      const currentMonthStart = startOfMonth(new Date());
      const previousMonthStart = startOfMonth(subMonths(new Date(), 1));
      const currentMonthEnd = endOfMonth(new Date());
      const previousMonthEnd = endOfMonth(subMonths(new Date(), 1));
      const topUsersDataAggregation = topUsersAggregation();
      const usersAgg = await User.aggregate([
        {
          $lookup: {
            from: 'roles',
            localField: 'role',
            foreignField: '_id',
            as: 'role',
          },
        },
        {
          $unwind: '$role',
        },
        {
          $match: {
            'role.name': UserRole.User,
          },
        },
        {
          $facet: {
            totalUsers: [
              {
                $match: {
                  status: { $in: [STATUS_TYPE.active, STATUS_TYPE.blocked] },
                },
              },
              {
                $count: 'count',
              },
            ],
            currentMonthCount: [
              {
                $match: {
                  createdAt: {
                    $gte: currentMonthStart,
                    $lte: currentMonthEnd,
                  },
                },
              },
              {
                $count: 'count',
              },
            ],
            previousMonthCount: [
              {
                $match: {
                  createdAt: {
                    $gte: previousMonthStart,
                    $lte: previousMonthEnd,
                  },
                },
              },
              {
                $count: 'count',
              },
            ],
          },
        },
      ]).exec();
      const totalUsers = usersAgg[0]?.totalUsers[0]?.count || 0;
      const currentMonthUserCount =
        usersAgg[0]?.currentMonthCount[0]?.count || 0;
      const previousMonthUserCount =
        usersAgg[0]?.previousMonthCount[0]?.count || 0;

      let percentageDifferenceUserCount;
      if (previousMonthUserCount === 0) {
        percentageDifferenceUserCount = currentMonthUserCount === 0 ? 0 : 100;
      } else {
        percentageDifferenceUserCount =
          ((currentMonthUserCount - previousMonthUserCount) /
            previousMonthUserCount) *
          100;
      }
      const topReelsDataAggregation = topReelsAggregation();
      const reelChartAggregation = yearMonthChartAggregation();
      const reelAgg = await Reel.aggregate([
        {
          $facet: {
            totalReels: [
              {
                $match: {
                  status: { $in: [STATUS_TYPE.active, STATUS_TYPE.blocked] },
                },
              },
              {
                $count: 'count',
              },
            ],
            topUsers: [
              ...topUsersDataAggregation,
              {
                $limit: limit,
              },
            ],
            topReels: [
              ...topReelsDataAggregation,
              {
                $limit: limit,
              },
            ],
            firstReel: [
              {
                $sort: {
                  createdAt: 1,
                },
              },
              {
                $limit: 1,
              },
              {
                $project: {
                  year: {
                    $year: '$createdAt',
                  },
                },
              },
            ],
            chartData: reelChartAggregation,
            currentMonthCount: [
              {
                $match: {
                  createdAt: {
                    $gte: currentMonthStart,
                    $lte: currentMonthEnd,
                  },
                },
              },
              {
                $count: 'count',
              },
            ],
            previousMonthCount: [
              {
                $match: {
                  createdAt: {
                    $gte: previousMonthStart,
                    $lte: previousMonthEnd,
                  },
                },
              },
              {
                $count: 'count',
              },
            ],
          },
        },
      ]).exec();
      const totalReels = reelAgg[0]?.totalReels[0]?.count || 0;
      const topUsersData = reelAgg[0]?.topUsers || [];
      const topReelsData = reelAgg[0]?.topReels || [];
      const reelChartData = reelAgg[0]?.chartData || [];
      const firstReelYear = reelAgg[0]?.firstReel[0]?.year || 0;
      const currentMonthReelCount =
        reelAgg[0]?.currentMonthCount[0]?.count || 0;
      const previousMonthReelCount =
        reelAgg[0]?.previousMonthCount[0]?.count || 0;
      let percentageDifferenceReelCount;
      if (previousMonthReelCount === 0) {
        percentageDifferenceReelCount = currentMonthReelCount === 0 ? 0 : 100;
      } else {
        percentageDifferenceReelCount =
          ((currentMonthReelCount - previousMonthReelCount) /
            previousMonthReelCount) *
          100;
      }

      const reportsAgg = await Report.aggregate([
        {
          $facet: {
            pagination: [{ $count: 'total' }],
            reelReports: [
              {
                $match: {
                  result: REPORT_STATUS.pending,
                  status: STATUS_TYPE.active,
                  reportType: REPORT_TYPE.reel,
                },
              },
              {
                $lookup: {
                  from: 'reels',
                  localField: 'reel',
                  foreignField: '_id',
                  as: 'reel',
                },
              },
              { $unwind: { path: '$reel', preserveNullAndEmptyArrays: true } },
              {
                $lookup: {
                  from: 'users',
                  localField: 'reportedBy',
                  foreignField: '_id',
                  as: 'reportedBy',
                },
              },
              {
                $unwind: {
                  path: '$reportedBy',
                  preserveNullAndEmptyArrays: true,
                },
              },
              {
                $lookup: {
                  from: 'users',
                  localField: 'reel.createdBy',
                  foreignField: '_id',
                  as: 'reel.createdBy',
                },
              },
              {
                $unwind: {
                  path: '$reel.createdBy',
                  preserveNullAndEmptyArrays: true,
                },
              },
              {
                $lookup: {
                  from: 'comments',
                  let: { reelId: '$reel._id' },
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
                  as: 'reel.commentStats',
                },
              },
              { $sort: { createdAt: -1 } },
              {
                $project: {
                  _id: 0,
                  reportType: 1,
                  id: '$_id',
                  reason: 1,
                  reportedBy: {
                    id: '$reportedBy._id',
                    name: '$reportedBy.name',
                    displayName: '$reportedBy.displayName',
                    profile: {
                      $cond: {
                        if: { $not: ['$reportedBy.profile'] },
                        then: '$$REMOVE',
                        else: {
                          $concat: [
                            config.host + '/profile/',
                            '$reportedBy.profile',
                          ],
                        },
                      },
                    },
                  },
                  reel: {
                    $cond: [
                      { $not: ['$reel._id'] },
                      '$$REMOVE',
                      {
                        id: '$reel._id',
                        caption: '$reel.caption',
                        status: '$reel.status',
                        totalLikes: {
                          $size: { $ifNull: ['$reel.likedBy', []] },
                        },
                        totalViews: {
                          $size: { $ifNull: ['$reel.viewedBy', []] },
                        },
                        totalComments: {
                          $cond: [
                            { $gt: [{ $size: '$reel.commentStats' }, 0] },
                            { $arrayElemAt: ['$reel.commentStats.count', 0] },
                            0,
                          ],
                        },
                        createdBy: {
                          id: '$reel.createdBy._id',
                          name: '$reel.createdBy.name',
                          displayName: '$reel.createdBy.displayName',
                          profile: {
                            $cond: {
                              if: { $not: ['$reel.createdBy.profile'] },
                              then: '$$REMOVE',
                              else: {
                                $concat: [
                                  config.host + '/profile/',
                                  '$reel.createdBy.profile',
                                ],
                              },
                            },
                          },
                        },
                        media: {
                          $cond: [
                            { $eq: ['$reel.mediaType', MEDIA_TYPE.image] },
                            {
                              $cond: [
                                { $isArray: '$reel.media' },
                                {
                                  $map: {
                                    input: '$reel.media',
                                    as: 'img',
                                    in: {
                                      $concat: [config.host, '/reel/', '$$img'],
                                    },
                                  },
                                },
                                {
                                  $cond: [
                                    { $ne: ['$reel.media', null] },
                                    [
                                      {
                                        $concat: [
                                          config.host,
                                          '/reel/',
                                          '$reel.media',
                                        ],
                                      },
                                    ],
                                    '$$REMOVE',
                                  ],
                                },
                              ],
                            },
                            {
                              $cond: [
                                { $eq: ['$reel.mediaType', MEDIA_TYPE.video] },
                                {
                                  $concat: [
                                    config.host,
                                    '/api/reel/view/',
                                    { $toString: '$reel._id' },
                                  ],
                                },
                                '$$REMOVE',
                              ],
                            },
                          ],
                        },
                        mediaType: '$reel.mediaType',
                        thumbnail: {
                          $cond: [
                            { $ifNull: ['$reel.thumbnail', false] },
                            {
                              $concat: [
                                config.host,
                                '/thumbnail/',
                                '$reel.thumbnail',
                              ],
                            },
                            '$$REMOVE',
                          ],
                        },
                      },
                    ],
                  },
                },
              },
              { $limit: limit },
            ],
            commentReports: [
              {
                $match: {
                  result: REPORT_STATUS.pending,
                  status: STATUS_TYPE.active,
                  reportType: { $in: [REPORT_TYPE.comment, REPORT_TYPE.reply] },
                },
              },
              {
                $lookup: {
                  from: 'reels',
                  localField: 'reel',
                  foreignField: '_id',
                  as: 'reel',
                },
              },
              { $unwind: { path: '$reel', preserveNullAndEmptyArrays: true } },
              {
                $lookup: {
                  from: 'comments',
                  localField: 'comment',
                  foreignField: '_id',
                  as: 'comment',
                },
              },
              {
                $unwind: { path: '$comment', preserveNullAndEmptyArrays: true },
              },
              {
                $lookup: {
                  from: 'users',
                  localField: 'reportedBy',
                  foreignField: '_id',
                  as: 'reportedBy',
                },
              },
              {
                $unwind: {
                  path: '$reportedBy',
                  preserveNullAndEmptyArrays: true,
                },
              },
              {
                $lookup: {
                  from: 'users',
                  localField: 'reel.createdBy',
                  foreignField: '_id',
                  as: 'reel.createdBy',
                },
              },
              {
                $unwind: {
                  path: '$reel.createdBy',
                  preserveNullAndEmptyArrays: true,
                },
              },
              {
                $addFields: {
                  replyObject: {
                    $first: {
                      $filter: {
                        input: '$comment.replies',
                        as: 'rep',
                        cond: { $eq: ['$$rep._id', '$reply'] },
                      },
                    },
                  },
                },
              },
              {
                $lookup: {
                  from: 'comments',
                  let: { reelId: '$reel._id' },
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
                  as: 'reel.commentStats',
                },
              },
              { $sort: { createdAt: -1 } },
              {
                $project: {
                  _id: 0,
                  reportType: 1,
                  id: '$_id',
                  reason: 1,
                  reportedBy: {
                    id: '$reportedBy._id',
                    name: '$reportedBy.name',
                    displayName: '$reportedBy.displayName',
                    profile: {
                      $cond: {
                        if: { $not: ['$reportedBy.profile'] },
                        then: '$$REMOVE',
                        else: {
                          $concat: [
                            config.host + '/profile/',
                            '$reportedBy.profile',
                          ],
                        },
                      },
                    },
                  },
                  reel: {
                    $cond: [
                      { $not: ['$reel._id'] },
                      '$$REMOVE',
                      {
                        id: '$reel._id',
                        caption: '$reel.caption',
                        status: '$reel.status',
                        totalLikes: {
                          $size: { $ifNull: ['$reel.likedBy', []] },
                        },
                        totalViews: {
                          $size: { $ifNull: ['$reel.viewedBy', []] },
                        },
                        totalComments: {
                          $cond: [
                            { $gt: [{ $size: '$reel.commentStats' }, 0] },
                            { $arrayElemAt: ['$reel.commentStats.count', 0] },
                            0,
                          ],
                        },
                        createdBy: {
                          id: '$reel.createdBy._id',
                          name: '$reel.createdBy.name',
                          displayName: '$reel.createdBy.displayName',
                          profile: {
                            $cond: {
                              if: { $not: ['$reel.createdBy.profile'] },
                              then: '$$REMOVE',
                              else: {
                                $concat: [
                                  config.host + '/profile/',
                                  '$reel.createdBy.profile',
                                ],
                              },
                            },
                          },
                        },
                        media: {
                          $cond: [
                            { $eq: ['$reel.mediaType', MEDIA_TYPE.image] },
                            {
                              $cond: [
                                { $isArray: '$reel.media' },
                                {
                                  $map: {
                                    input: '$reel.media',
                                    as: 'img',
                                    in: {
                                      $concat: [config.host, '/reel/', '$$img'],
                                    },
                                  },
                                },
                                {
                                  $cond: [
                                    { $ne: ['$reel.media', null] },
                                    [
                                      {
                                        $concat: [
                                          config.host,
                                          '/reel/',
                                          '$reel.media',
                                        ],
                                      },
                                    ],
                                    '$$REMOVE',
                                  ],
                                },
                              ],
                            },
                            {
                              $cond: [
                                { $eq: ['$reel.mediaType', MEDIA_TYPE.video] },
                                {
                                  $concat: [
                                    config.host,
                                    '/api/reel/view/',
                                    { $toString: '$reel._id' },
                                  ],
                                },
                                '$$REMOVE',
                              ],
                            },
                          ],
                        },
                        mediaType: '$reel.mediaType',
                        thumbnail: {
                          $cond: [
                            { $ifNull: ['$reel.thumbnail', false] },
                            {
                              $concat: [
                                config.host,
                                '/thumbnail/',
                                '$reel.thumbnail',
                              ],
                            },
                            '$$REMOVE',
                          ],
                        },
                      },
                    ],
                  },
                  comment: {
                    $cond: [
                      { $eq: ['$reportType', REPORT_TYPE.reply] },
                      {
                        id: '$replyObject._id',
                        content: '$replyObject.content',
                        commentId: '$comment._id',
                        commentContent: '$comment.content',
                      },
                      {
                        $cond: [
                          { $eq: ['$reportType', REPORT_TYPE.comment] },
                          {
                            id: '$comment._id',
                            content: '$comment.content',
                          },
                          '$$REMOVE',
                        ],
                      },
                    ],
                  },
                },
              },
              { $limit: limit },
            ],
          },
        },
      ]).exec();

      const totalReports = reportsAgg[0]?.pagination[0]?.total || 0;
      const reelReports = reportsAgg[0]?.reelReports || [];
      const commentReports = reportsAgg[0]?.commentReports || [];

      res.status(200).json({
        success: true,
        data: {
          users: {
            totalRecords: totalUsers,
            top: topUsersData,
            currentMonthCount: currentMonthUserCount,
            previousMonthCount: previousMonthUserCount,
            percentageDifference: percentageDifferenceUserCount,
          },
          reels: {
            totalRecords: totalReels,
            top: topReelsData,
            chartData: reelChartData,
            firstReelYear: firstReelYear,
            currentMonthCount: currentMonthReelCount,
            previousMonthCount: previousMonthReelCount,
            percentageDifference: percentageDifferenceReelCount,
          },
          reports: {
            totalRecords: totalReports,
            reelReports: reelReports,
            commentReports: commentReports,
          },
        },
      });
    } catch (error) {
      throw error;
    }
  }
);
