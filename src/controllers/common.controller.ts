import expressAsyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import { AES, enc, mode, pad } from 'crypto-js';
import { config } from '../config/config';
import { decryptData } from '../utils/encrypt';
import { Role } from '../models/role.model';
import { REPORT_STATUS, REPORT_TYPE, STATUS_TYPE } from '../config/enums';
import { Reel } from '../models/reel.model';
import { Report } from '../models/report.model';
import { UserRole } from '../config/constants';
import { User } from '../models/user.model';
import moment from 'moment';
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

export const getRoles = expressAsyncHandler(async (req: any, res) => {
  try {
    const roles = await Role.find();
    res.status(200).send({
      success: true,
      data: roles,
    });
  } catch (error) {
    throw error;
  }
});

export const checkHealth = expressAsyncHandler(async (req: any, res) => {
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

export const yearMonthChartAggregation = async (year: number, model: any): Promise<any> => {
  const startDate = moment(`${year}-01-01`).toDate();
  const endDate = moment(`${year}-12-31`).toDate();
  const aggregation = await model.aggregate([
    {
      $match: {
        createdAt: {
          $gte: startDate,
          $lt: endDate,
        },
      },
    },
    {
      $group: {
        _id: { month: { $month: '$createdAt' } },
        count: { $sum: 1 },
      },
    },
    {
      $project: {
        _id: 0,
        month: '$_id.month',
        count: 1,
      },
    },
    {
      $facet: {
        data: [
          {
            $group: {
              _id: null,
              data: { $push: { month: '$month', count: '$count' } },
            },
          },
          {
            $project: {
              _id: 0,
              months: {
                $map: {
                  input: Array.from({ length: 12 }, (_, i) => i + 1),
                  as: 'm',
                  in: {
                    $let: {
                      vars: {
                        match: {
                          $first: {
                            $filter: {
                              input: '$data',
                              as: 'd',
                              cond: { $eq: ['$$d.month', '$$m'] },
                            },
                          },
                        },
                      },
                      in: {
                        month: '$$m',
                        count: { $ifNull: ['$$match.count', 0] },
                      },
                    },
                  },
                },
              },
            },
          },
          {
            $unwind: '$months',
          },
          {
            $replaceRoot: { newRoot: '$months' },
          },
        ],
      },
    },
    {
      $unwind: '$data',
    },
    {
      $replaceRoot: { newRoot: '$data' },
    },
    {
      $sort: { month: 1 },
    },
    {
      $facet: {
        monthsData: [],
        pagination: [
          {
            $group: {
              _id: null,
              total: { $sum: '$count' },
            },
          },
          {
            $project: {
              _id: 0,
              total: 1,
            },
          },
        ],
      },
    },
  ]);
  return {
    monthlyCount: aggregation[0]?.monthsData || [],
    totalRecords: aggregation[0]?.pagination[0]?.total || 0,
  };
};

export const adminDashboardDetails = expressAsyncHandler(
  async (req: any, res) => {
    try {
      const limit = parseInt(req.query.limit) || 5;
      const currentMonthStart = moment().startOf('month').toDate();
      const previousMonthStart = moment()
        .subtract(1, 'month')
        .startOf('month')
        .toDate();
      const currentMonthEnd = moment().endOf('month').toDate();
      const previousMonthEnd = moment()
        .subtract(1, 'month')
        .endOf('month')
        .toDate();
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
      ]);
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
      const currentYear = moment().year();
      const reelAgg = await Reel.aggregate([
        {
          $facet: {
            totalReels: [
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
      ]);
      const totalReels = reelAgg[0]?.totalReels[0]?.count || 0;
      const topUsersData = reelAgg[0]?.topUsers;
      const topReelsData = reelAgg[0]?.topReels;
      const reelChartData = await yearMonthChartAggregation(currentYear, Reel);
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
                $project: {
                  _id: 0,
                  reportType: 1,
                  id: '$_id',
                  reel: {
                    $cond: [
                      { $not: ['$reel._id'] },
                      '$$REMOVE',
                      {
                        id: '$reel._id',
                        caption: '$reel.caption',
                        media: {
                          $cond: [
                            { $eq: ['$reel.mediaType', 'image'] },
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
                                { $eq: ['$reel.mediaType', 'video'] },
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
              { $sort: { createdAt: -1 } },
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
                $project: {
                  _id: 0,
                  reportType: 1,
                  id: '$_id',
                  reel: {
                    $cond: [
                      { $not: ['$reel._id'] },
                      '$$REMOVE',
                      {
                        id: '$reel._id',
                        caption: '$reel.caption',
                        media: {
                          $cond: [
                            { $eq: ['$reel.mediaType', 'image'] },
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
                                { $eq: ['$reel.mediaType', 'video'] },
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
                      { $eq: ['$reportType', 'reply'] },
                      {
                        id: '$replyObject._id',
                        content: '$replyObject.content',
                        commentId: '$comment._id',
                        commentContent: '$comment.content',
                      },
                      {
                        $cond: [
                          { $eq: ['$reportType', 'comment'] },
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
              { $sort: { createdAt: -1 } },
              { $limit: limit },
            ],
          },
        },
      ]);

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
