import expressAsyncHandler from 'express-async-handler';
import { Report } from '../models/report.model';
import mongoose from 'mongoose';
import {
  MEDIA_TYPE,
  REPORT_STATUS,
  REPORT_TYPE,
  STATUS_TYPE,
} from '../config/enums';
import { IReel, Reel } from '../models/reel.model';
import { t } from 'i18next';
import { Comment, IComment } from '../models/comment.model';
import { config } from '../config/config';
import { UserRole } from '../config/constants';
import { parseISO, isValid, startOfDay, endOfDay } from 'date-fns';
import { User } from '../models/user.model';

export const createReport = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const {
      reelId: reel,
      commentId: comment,
      replyId: reply,
      reason,
      reportType,
    } = req.body;

    if (!reel) {
      res.status(400);
      throw new Error('invalid_request');
    }
    if (!reason) {
      res.status(400);
      throw new Error('reason_required');
    }
    const reelExists = await Reel.findById(reel).exec();
    if (!reelExists || reelExists.status !== STATUS_TYPE.active) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    if (comment) {
      const commentExists = await Comment.findById(comment).exec();
      if (!commentExists || commentExists.status !== STATUS_TYPE.active) {
        res.status(404);
        throw new Error('comment_not_found');
      }
    }
    if (reply) {
      const replyExists = await Comment.findOne({
        _id: new mongoose.Types.ObjectId(String(comment)),
        replies: {
          $elemMatch: {
            _id: new mongoose.Types.ObjectId(String(reply)),
            status: STATUS_TYPE.active,
          },
        },
      }).exec();
      if (!replyExists) {
        res.status(404);
        throw new Error('reply_not_found');
      }
    }

    const createData: any = {
      reportedBy: new mongoose.Types.ObjectId(String(userId)),
      reel: new mongoose.Types.ObjectId(String(reel)),
      reason,
      reportType,
    };

    if (comment) {
      createData.comment = new mongoose.Types.ObjectId(String(comment));
    }
    if (reply) {
      createData.reply = new mongoose.Types.ObjectId(String(reply));
    }

    const alreadyReportedQuery: any = {
      reportedBy: new mongoose.Types.ObjectId(String(userId)),
      reel: new mongoose.Types.ObjectId(String(reel)),
      reason,
      reportType,
    };

    if (comment) {
      alreadyReportedQuery.comment = new mongoose.Types.ObjectId(
        String(comment)
      );
    }
    if (reply) {
      alreadyReportedQuery.reply = new mongoose.Types.ObjectId(String(reply));
    }

    const alreadyReported = await Report.findOne(alreadyReportedQuery).exec();

    if (!alreadyReported) {
      createData.updatedBy = userId;
      await Report.create(createData);
    }
    res.status(201).json({
      success: true,
      data: true,
      message: t('report_created'),
    });
  } catch (error) {
    throw error;
  }
});

export const getReports = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search;
    const result = req.query.result;
    const status = req.query.status;
    const reportType = req.query.reportType;
    const reportedBy = req.query.reportedBy;
    const reportedTo = req.query.userId;
    const sortBy = req.query.sortBy;
    const sortOrder = req.query.sortOrder;
    const startDate = req.query.startDate
      ? parseISO(req.query.startDate)
      : null;
    const endDate = req.query.endDate ? parseISO(req.query.endDate) : null;

    const matchQuery: any = {};
    const sortQuery: any = {};
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

    if (
      sortOrder &&
      sortBy &&
      (sortOrder === 'asc' || sortOrder === 'desc') &&
      ['createdAt', 'updatedAt', 'reviewedAt', 'totalAcceptedReports'].includes(
        sortBy
      )
    ) {
      sortQuery[sortBy] = sortOrder === 'asc' ? 1 : -1;
    } else {
      sortQuery.createdAt = -1;
    }
    if (reportType) {
      if (reportType === REPORT_TYPE.reel) {
        matchQuery.reportType = REPORT_TYPE.reel;
      } else if (reportType === REPORT_TYPE.comment) {
        matchQuery.reportType = {
          $in: [REPORT_TYPE.comment, REPORT_TYPE.reply],
        };
      }
    }
    if (result) {
      matchQuery.result = result;
    }
    if (status) {
      matchQuery.status = status;
    }
    if (reportedBy) {
      matchQuery.reportedBy = new mongoose.Types.ObjectId(String(reportedBy));
    }
    const reportAggregations = getReportsAggregate();
    const reportsAggregate = await Report.aggregate([
      { $match: matchQuery },
      ...reportAggregations,
      {
        $unwind: { path: '$reel', preserveNullAndEmptyArrays: true },
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
            {
              $unwind: {
                path: '$commentedByUser',
                preserveNullAndEmptyArrays: false,
              },
            },
            {
              $match: {
                'commentedByUser.status': STATUS_TYPE.active,
              },
            },
            {
              $count: 'count',
            },
          ],
          as: 'reel.activeCommentsCount',
        },
      },
      {
        $addFields: {
          'reel.totalLikes': { $size: { $ifNull: ['$reel.likedBy', []] } },
          'reel.totalViews': { $size: { $ifNull: ['$reel.viewedBy', []] } },
          'reel.totalComments': {
            $cond: [
              { $gt: [{ $size: '$reel.activeCommentsCount' }, 0] },
              { $arrayElemAt: ['$reel.activeCommentsCount.count', 0] },
              0,
            ],
          },
        },
      },
      {
        $lookup: {
          from: 'reports',
          let: {
            currentReportType: '$reportType',
            reelId: '$reel._id',
            commentId: '$comment._id',
            replyId: '$replyObj._id',
          },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$result', REPORT_STATUS.accepted] },
                    {
                      $switch: {
                        branches: [
                          {
                            case: {
                              $eq: ['$$currentReportType', REPORT_TYPE.reel],
                            },
                            then: {
                              $and: [
                                { $eq: ['$reel', '$$reelId'] },
                                { $eq: ['$reportType', REPORT_TYPE.reel] },
                              ],
                            },
                          },
                          {
                            case: {
                              $eq: ['$$currentReportType', REPORT_TYPE.comment],
                            },
                            then: {
                              $and: [
                                { $eq: ['$reel', '$$reelId'] },
                                { $eq: ['$comment', '$$commentId'] },
                                { $eq: ['$reportType', REPORT_TYPE.comment] },
                              ],
                            },
                          },
                          {
                            case: {
                              $eq: ['$$currentReportType', REPORT_TYPE.reply],
                            },
                            then: {
                              $and: [
                                { $eq: ['$reel', '$$reelId'] },
                                { $eq: ['$comment', '$$commentId'] },
                                { $eq: ['$reply', '$$replyId'] },
                                { $eq: ['$reportType', REPORT_TYPE.reply] },
                              ],
                            },
                          },
                        ],
                        default: false,
                      },
                    },
                  ],
                },
              },
            },
            {
              $count: 'count',
            },
          ],
          as: 'acceptedReports',
        },
      },
      {
        $addFields: {
          totalAcceptedReports: {
            $cond: [
              { $gt: [{ $size: '$acceptedReports' }, 0] },
              { $arrayElemAt: ['$acceptedReports.count', 0] },
              0,
            ],
          },
        },
      },
      {
        $match: {
          $expr: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$reportType', REPORT_TYPE.reel] },
                  then: { $eq: ['$reel.status', STATUS_TYPE.active] },
                },
                {
                  case: { $eq: ['$reportType', REPORT_TYPE.comment] },
                  then: { $eq: ['$comment.status', STATUS_TYPE.active] },
                },
                {
                  case: { $eq: ['$reportType', REPORT_TYPE.reply] },
                  then: { $eq: ['$replyObj.status', STATUS_TYPE.active] },
                },
              ],
              default: false,
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          id: '$_id',
          totalAcceptedReports: '$totalAcceptedReports',
          reel: {
            id: '$reel._id',
            caption: '$reel.caption',
            isBlocked: { $eq: ['$reel.status', STATUS_TYPE.blocked] },
            status: '$reel.status',
            totalViews: '$reel.totalViews',
            totalLikes: '$reel.totalLikes',
            totalComments: '$reel.totalComments',
            media: {
              $cond: [
                { $eq: ['$reel.mediaType', MEDIA_TYPE.image] },
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
                  $concat: [
                    config.host + '/api/reel/view/',
                    { $toString: '$reel._id' },
                  ],
                },
              ],
            },
            mediaType: '$reel.mediaType',
            thumbnail: {
              $cond: [
                { $ifNull: ['$reel.thumbnail', false] },
                {
                  $concat: [config.host + '/thumbnail/', '$reel.thumbnail'],
                },
                '$$REMOVE',
              ],
            },
            createdBy: {
              id: '$reel.createdBy._id',
              name: '$reel.createdBy.name',
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
          },
          comment: {
            $cond: [
              { $eq: ['$reportType', REPORT_TYPE.reply] },
              {
                id: '$replyObj._id',
                isBlocked: { $eq: ['$replyObj.status', STATUS_TYPE.blocked] },
                content: '$replyObj.content',
                status: '$replyObj.status',
                commentId: '$comment._id',
                commentContent: '$comment.content',
                createdBy: {
                  id: '$replyObj.createdBy._id',
                  name: '$replyObj.createdBy.name',
                  profile: {
                    $cond: {
                      if: { $not: ['$replyObj.createdBy.profile'] },
                      then: '$$REMOVE',
                      else: {
                        $concat: [
                          config.host + '/profile/',
                          '$replyObj.createdBy.profile',
                        ],
                      },
                    },
                  },
                },
              },
              {
                $cond: [
                  { $eq: ['$reportType', REPORT_TYPE.comment] },
                  {
                    id: '$comment._id',
                    isBlocked: {
                      $eq: ['$comment.status', STATUS_TYPE.blocked],
                    },
                    content: '$comment.content',
                    status: '$comment.status',
                    createdBy: {
                      id: '$comment.createdBy._id',
                      name: '$comment.createdBy.name',
                      profile: {
                        $cond: {
                          if: { $not: ['$comment.createdBy.profile'] },
                          then: '$$REMOVE',
                          else: {
                            $concat: [
                              config.host + '/profile/',
                              '$comment.createdBy.profile',
                            ],
                          },
                        },
                      },
                    },
                  },
                  '$$REMOVE',
                ],
              },
            ],
          },
          reportedBy: {
            id: '$reportedBy._id',
            name: '$reportedBy.name',
            profile: {
              $cond: {
                if: { $not: ['$reportedBy.profile'] },
                then: '$$REMOVE',
                else: {
                  $concat: [config.host + '/profile/', '$reportedBy.profile'],
                },
              },
            },
          },
          reason: 1,
          reportType: 1,
          status: 1,
          reviewedBy: {
            $cond: {
              if: { $not: ['$reviewedAt'] },
              then: '$$REMOVE',
              else: {
                id: '$reviewedBy._id',
                name: '$reviewedBy.name',
                profile: {
                  $cond: {
                    if: { $not: ['$reviewedBy.profile'] },
                    then: '$$REMOVE',
                    else: {
                      $concat: [
                        config.host + '/profile/',
                        '$reviewedBy.profile',
                      ],
                    },
                  },
                },
              },
            },
          },
          reviewedAt: {
            $cond: {
              if: { $not: ['$reviewedAt'] },
              then: '$$REMOVE',
              else: '$reviewedAt',
            },
          },
          notes: {
            $cond: {
              if: { $not: ['$notes'] },
              then: '$$REMOVE',
              else: '$notes',
            },
          },
          result: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
      {
        $match: search
          ? {
              $or: [
                { reason: { $regex: search, $options: 'i' } },
                { notes: { $regex: search, $options: 'i' } },
                { 'reel.caption': { $regex: search, $options: 'i' } },
                { 'comment.content': { $regex: search, $options: 'i' } },
                { 'replyObj.content': { $regex: search, $options: 'i' } },
              ],
            }
          : {},
      },
      {
        $match: reportedTo
          ? {
              $expr: {
                $cond: [
                  { $eq: ['$reportType', REPORT_TYPE.reel] },
                  {
                    $eq: [
                      '$reel.createdBy.id',
                      new mongoose.Types.ObjectId(String(reportedTo)),
                    ],
                  },
                  {
                    $eq: [
                      '$comment.createdBy.id',
                      new mongoose.Types.ObjectId(String(reportedTo)),
                    ],
                  },
                ],
              },
            }
          : {},
      },
      {
        $facet: {
          reports: [
            {
              $sort: sortQuery,
            },
            { $skip: skip },
            { $limit: limit },
          ],
          pagination: [{ $count: 'total' }],
        },
      },
    ]).exec();
    const total = reportsAggregate[0]?.pagination[0]?.total || 0;
    let data: any = {
      reports: reportsAggregate[0]?.reports || [],
      totalRecords: total,
      totalPages: Math.ceil(total / limit),
    };
    if (reportedTo) {
      const user = await User.findById(reportedTo)
        .select('name profile displayName')
        .exec();
      if (user) {
        data.user = user;
      }
    }
    res.status(200).json({
      success: true,
      data: data,
    });
  } catch (error) {
    throw error;
  }
});

export const deleteReport = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    if (!id) {
      res.status(400);
      throw new Error('invalid_request');
    }
    const report = await Report.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(String(id)),
        status: { $ne: STATUS_TYPE.deleted },
      },
      {
        status: STATUS_TYPE.deleted,
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      }
    ).exec();

    if (!report) {
      res.status(404);
      throw new Error('report_not_found');
    }

    res.status(200).json({
      success: true,
      message: t('report_deleted'),
    });
  } catch (error) {
    throw error;
  }
});

export const blockedReelsContent = expressAsyncHandler(
  async (req: any, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const search = req.query.search;
      const sortBy = req.query.sortBy;
      const sortOrder = req.query.sortOrder;
      const startDate = req.query.startDate
        ? parseISO(req.query.startDate)
        : null;
      const endDate = req.query.endDate ? parseISO(req.query.endDate) : null;

      const matchQuery: any = {};
      const sortQuery: any = {};
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

      if (
        sortOrder &&
        sortBy &&
        (sortOrder === 'asc' || sortOrder === 'desc') &&
        [
          'createdAt',
          'updatedAt',
          'totalReports',
          'totalPendingReports',
          'totalAcceptedReports',
          'totalRejectedReports',
        ].includes(sortBy)
      ) {
        sortQuery[sortBy] = sortOrder === 'asc' ? 1 : -1;
      } else {
        sortQuery.createdAt = -1;
      }

      const reportAggregations = getReportsAggregate();
      const reportsAggregate = await Report.aggregate([
        { $match: { ...matchQuery, reportType: REPORT_TYPE.reel } },
        ...reportAggregations,
        {
          $lookup: {
            from: 'users',
            localField: 'reel.updatedBy',
            foreignField: '_id',
            as: 'reel.blockedBy',
          },
        },
        {
          $unwind: '$reel.blockedBy',
        },
        {
          $group: {
            _id: {
              reportType: '$reportType',
              reelId: '$reel._id',
            },
            totalReports: { $sum: 1 },
            totalPendingReports: {
              $sum: {
                $cond: [{ $eq: ['$result', REPORT_STATUS.pending] }, 1, 0],
              },
            },
            totalAcceptedReports: {
              $sum: {
                $cond: [{ $eq: ['$result', REPORT_STATUS.accepted] }, 1, 0],
              },
            },
            totalRejectedReports: {
              $sum: {
                $cond: [{ $eq: ['$result', REPORT_STATUS.rejected] }, 1, 0],
              },
            },
            reel: { $first: '$reel' },
          },
        },
        {
          $match: {
            'reel.status': STATUS_TYPE.blocked,
          },
        },
        {
          $match: search
            ? { 'reel.caption': { $regex: search, $options: 'i' } }
            : {},
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
        {
          $addFields: {
            totalLikes: { $size: { $ifNull: ['$reel.likedBy', []] } },
            totalViews: { $size: { $ifNull: ['$reel.viewedBy', []] } },
            totalComments: {
              $cond: [
                { $gt: [{ $size: '$reel.commentStats' }, 0] },
                { $arrayElemAt: ['$reel.commentStats.count', 0] },
                0,
              ],
            },
          },
        },
        {
          $project: {
            _id: 0,
            reportType: 1,
            totalReports: 1,
            totalPendingReports: 1,
            totalAcceptedReports: 1,
            totalRejectedReports: 1,
            id: '$reel._id',
            caption: '$reel.caption',
            status: '$reel.status',
            totalLikes: '$totalLikes',
            totalViews: '$totalViews',
            totalComments: '$totalComments',
            blockedBy: {
              id: '$reel.blockedBy._id',
              name: '$reel.blockedBy.name',
              profile: {
                $cond: {
                  if: { $not: ['$reel.blockedBy.profile'] },
                  then: '$$REMOVE',
                  else: {
                    $concat: [
                      config.host + '/profile/',
                      '$reel.blockedBy.profile',
                    ],
                  },
                },
              },
            },
            media: {
              $cond: [
                { $eq: ['$reel.mediaType', MEDIA_TYPE.image] },
                {
                  $map: {
                    input: '$reel.media',
                    as: 'img',
                    in: { $concat: [config.host, '/reel/', '$$img'] },
                  },
                },
                {
                  $concat: [
                    config.host + '/api/reel/view/',
                    { $toString: '$reel._id' },
                  ],
                },
              ],
            },
            mediaType: '$reel.mediaType',
            thumbnail: {
              $cond: [
                { $ifNull: ['$reel.thumbnail', false] },
                {
                  $concat: [config.host + '/thumbnail/', '$reel.thumbnail'],
                },
                '$$REMOVE',
              ],
            },
            createdBy: {
              id: '$reel.createdBy._id',
              name: '$reel.createdBy.name',
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
          },
        },
        {
          $facet: {
            data: [{ $sort: sortQuery }, { $skip: skip }, { $limit: limit }],
            pagination: [{ $count: 'total' }],
          },
        },
      ]).exec();

      const reels = reportsAggregate[0]?.data || [];
      const total = reportsAggregate[0]?.pagination[0]?.total || 0;
      const totalPages = Math.ceil(total / limit);

      res.status(200).json({
        success: true,
        data: { reels, totalRecords: total, totalPages },
      });
    } catch (error) {
      throw error;
    }
  }
);

export const blockedCommentContent = expressAsyncHandler(
  async (req: any, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;
      const search = req.query.search;
      const sortBy = req.query.sortBy;
      const sortOrder = req.query.sortOrder;
      const startDate = req.query.startDate
        ? parseISO(req.query.startDate)
        : null;
      const endDate = req.query.endDate ? parseISO(req.query.endDate) : null;

      const matchQuery: any = {};
      const sortQuery: any = {};
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

      if (
        sortOrder &&
        sortBy &&
        (sortOrder === 'asc' || sortOrder === 'desc') &&
        [
          'createdAt',
          'updatedAt',
          'totalReports',
          'totalPendingReports',
          'totalAcceptedReports',
          'totalRejectedReports',
        ].includes(sortBy)
      ) {
        sortQuery[sortBy] = sortOrder === 'asc' ? 1 : -1;
      } else {
        sortQuery.createdAt = -1;
      }

      const reportAggregations = getReportsAggregate();
      const reportsAggregate = await Report.aggregate([
        {
          $match: {
            ...matchQuery,
            reportType: { $in: [REPORT_TYPE.comment, REPORT_TYPE.reply] },
          },
        },
        ...reportAggregations,
        {
          $match: search
            ? {
                $or: [
                  { 'comment.content': { $regex: search, $options: 'i' } },
                  { 'replyObj.content': { $regex: search, $options: 'i' } },
                ],
              }
            : {},
        },
        {
          $match: {
            $expr: {
              $switch: {
                branches: [
                  {
                    case: { $eq: ['$reportType', REPORT_TYPE.comment] },
                    then: { $eq: ['$comment.status', STATUS_TYPE.blocked] },
                  },
                  {
                    case: { $eq: ['$reportType', REPORT_TYPE.reply] },
                    then: { $eq: ['$replyObj.status', STATUS_TYPE.blocked] },
                  },
                ],
                default: false,
              },
            },
          },
        },
        {
          $group: {
            _id: {
              reportType: '$reportType',
              targetId: {
                $switch: {
                  branches: [
                    {
                      case: { $eq: ['$reportType', REPORT_TYPE.comment] },
                      then: '$comment._id',
                    },
                    {
                      case: { $eq: ['$reportType', REPORT_TYPE.reply] },
                      then: '$replyObj._id',
                    },
                  ],
                  default: null,
                },
              },
            },
            totalReports: { $sum: 1 },
            totalPendingReports: {
              $sum: {
                $cond: [{ $eq: ['$result', REPORT_STATUS.pending] }, 1, 0],
              },
            },
            totalAcceptedReports: {
              $sum: {
                $cond: [{ $eq: ['$result', REPORT_STATUS.accepted] }, 1, 0],
              },
            },
            totalRejectedReports: {
              $sum: {
                $cond: [{ $eq: ['$result', REPORT_STATUS.rejected] }, 1, 0],
              },
            },
            reel: { $first: '$reel' },
            comment: { $first: '$comment' },
            replyObj: { $first: '$replyObj' },
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
        {
          $addFields: {
            blockedById: {
              $cond: [
                { $eq: ['$_id.reportType', REPORT_TYPE.comment] },
                '$comment.updatedBy',
                '$replyObj.updatedBy',
              ],
            },
            'reel.totalLikes': { $size: { $ifNull: ['$reel.likedBy', []] } },
            'reel.totalViews': { $size: { $ifNull: ['$reel.viewedBy', []] } },
            'reel.totalComments': {
              $cond: [
                { $gt: [{ $size: '$reel.commentStats' }, 0] },
                { $arrayElemAt: ['$reel.commentStats.count', 0] },
                0,
              ],
            },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: 'blockedById',
            foreignField: '_id',
            as: 'blockedBy',
          },
        },
        {
          $unwind: '$blockedBy',
        },
        {
          $project: {
            _id: 0,
            reportType: 1,
            totalReports: 1,
            totalPendingReports: 1,
            totalAcceptedReports: 1,
            totalRejectedReports: 1,
            reel: {
              id: '$reel._id',
              caption: '$reel.caption',
              status: '$reel.status',
              totalLikes: '$reel.totalLikes',
              totalViews: '$reel.totalViews',
              totalComments: '$reel.totalComments',
              media: {
                $cond: [
                  { $eq: ['$reel.mediaType', MEDIA_TYPE.image] },
                  {
                    $map: {
                      input: '$reel.media',
                      as: 'img',
                      in: { $concat: [config.host, '/reel/', '$$img'] },
                    },
                  },
                  {
                    $concat: [
                      config.host + '/api/reel/view/',
                      { $toString: '$reel._id' },
                    ],
                  },
                ],
              },
              mediaType: '$reel.mediaType',
              thumbnail: {
                $cond: [
                  { $ifNull: ['$reel.thumbnail', false] },
                  {
                    $concat: [config.host + '/thumbnail/', '$reel.thumbnail'],
                  },
                  '$$REMOVE',
                ],
              },
              createdBy: {
                id: '$reel.createdBy._id',
                name: '$reel.createdBy.name',
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
            },
            id: {
              $cond: [
                { $eq: ['$_id.reportType', REPORT_TYPE.reply] },
                '$replyObj._id',
                {
                  $cond: [
                    { $eq: ['$_id.reportType', REPORT_TYPE.comment] },
                    '$comment._id',
                    '$reel._id',
                  ],
                },
              ],
            },
            commentId: {
              $cond: [
                { $eq: ['$_id.reportType', REPORT_TYPE.reply] },
                '$comment._id',
                '$$REMOVE',
              ],
            },
            commentContent: {
              $cond: [
                { $eq: ['$_id.reportType', REPORT_TYPE.reply] },
                '$comment.content',
                '$$REMOVE',
              ],
            },
            content: {
              $cond: [
                { $eq: ['$_id.reportType', REPORT_TYPE.comment] },
                '$comment.content',
                '$replyObj.content',
              ],
            },
            status: {
              $cond: [
                { $eq: ['$_id.reportType', REPORT_TYPE.comment] },
                '$comment.status',
                '$replyObj.status',
              ],
            },
            blockedBy: {
              id: '$blockedBy._id',
              name: '$blockedBy.name',
              profile: {
                $cond: {
                  if: { $not: ['$blockedBy.profile'] },
                  then: '$$REMOVE',
                  else: {
                    $concat: [config.host + '/profile/', '$blockedBy.profile'],
                  },
                },
              },
            },
            createdBy: {
              $cond: [
                { $eq: ['$_id.reportType', REPORT_TYPE.comment] },
                {
                  id: '$comment.createdBy._id',
                  name: '$comment.createdBy.name',
                  profile: {
                    $cond: {
                      if: { $not: ['$comment.createdBy.profile'] },
                      then: '$$REMOVE',
                      else: {
                        $concat: [
                          config.host + '/profile/',
                          '$comment.createdBy.profile',
                        ],
                      },
                    },
                  },
                },
                {
                  id: '$replyObj.createdBy._id',
                  name: '$replyObj.createdBy.name',
                  profile: {
                    $cond: {
                      if: { $not: ['$replyObj.createdBy.profile'] },
                      then: '$$REMOVE',
                      else: {
                        $concat: [
                          config.host + '/profile/',
                          '$replyObj.createdBy.profile',
                        ],
                      },
                    },
                  },
                },
              ],
            },
          },
        },
        {
          $facet: {
            data: [{ $sort: sortQuery }, { $skip: skip }, { $limit: limit }],
            pagination: [{ $count: 'total' }],
          },
        },
      ]).exec();

      const comments = reportsAggregate[0]?.data || [];
      const total = reportsAggregate[0]?.pagination[0]?.total || 0;
      const totalPages = Math.ceil(total / limit);

      res.status(200).json({
        success: true,
        data: { comments, totalRecords: total, totalPages },
      });
    } catch (error) {
      throw error;
    }
  }
);

export const getReportsByReelId = expressAsyncHandler(async (req: any, res) => {
  const { pipeline, limit } = getContentReportsAggregation(
    req.query,
    REPORT_TYPE.reel
  );
  const reportsAggregate = await Report.aggregate(pipeline).exec();

  const reports = reportsAggregate[0]?.reports || [];
  const total = reportsAggregate[0]?.pagination[0]?.total || 0;
  const totalPages = Math.ceil(total / limit);

  res.status(200).json({
    success: true,
    data: { reports, totalRecords: total, totalPages },
  });
});

export const getReportsByCommentId = expressAsyncHandler(
  async (req: any, res) => {
    const { pipeline, limit } = getContentReportsAggregation(
      req.query,
      REPORT_TYPE.comment
    );
    const reportsAggregate = await Report.aggregate(pipeline).exec();

    const reports = reportsAggregate[0]?.reports || [];
    const total = reportsAggregate[0]?.pagination[0]?.total || 0;
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      success: true,
      data: { reports, totalRecords: total, totalPages },
    });
  }
);

export const validateReport = expressAsyncHandler(async (req: any, res) => {
  const userId = req.user.id;
  const { id, result, notes, isBlocked } = req.body;

  if (!id || typeof isBlocked !== 'boolean') {
    res.status(400);
    throw new Error('invalid_request');
  }

  if (result === REPORT_STATUS.accepted && result === REPORT_STATUS.rejected) {
    res.status(400);
    throw new Error('invalid_review_validated');
  }

  const report = await Report.findByIdAndUpdate(
    id,
    {
      reviewedBy: new mongoose.Types.ObjectId(String(userId)),
      result,
      notes,
      reviewedAt: new Date(),
    },
    { new: true }
  )
    .populate([
      { path: 'reel', select: 'status' },
      { path: 'comment', select: 'status replies' },
    ])
    .exec();

  if (!report) {
    res.status(404);
    throw new Error('report_not_found');
  }

  const matchQuery: any = {
    result: REPORT_STATUS.accepted,
    reportType: report.reportType,
    reel: new mongoose.Types.ObjectId(String(report?.reel?._id)),
  };

  let responseId: any;
  let responseIsBlocked: boolean = false;

  switch (report.reportType) {
    case REPORT_TYPE.reel:
      const reel = report?.reel as IReel;
      responseId = report?.reel?._id;
      responseIsBlocked = reel?.status === STATUS_TYPE.blocked;
      break;
    case REPORT_TYPE.comment: {
      const comment = report?.comment as IComment;
      matchQuery.comment = new mongoose.Types.ObjectId(String(comment?._id));
      responseId = comment?._id;
      responseIsBlocked = comment?.status === STATUS_TYPE.blocked;
      break;
    }
    case REPORT_TYPE.reply: {
      const comment = report?.comment as IComment;
      matchQuery.comment = new mongoose.Types.ObjectId(String(comment?._id));
      matchQuery.reply = new mongoose.Types.ObjectId(String(report?.reply));
      responseId = report?.reply;
      const foundReply = comment?.replies?.find(
        (reply: any) => reply._id.toString() === report?.reply?.toString()
      );
      responseIsBlocked = foundReply?.status === STATUS_TYPE.blocked;
      break;
    }
  }

  const totalAcceptedReportsData = await Report.aggregate([
    { $match: matchQuery },
    { $count: 'totalAcceptedReports' },
  ]).exec();

  const totalAcceptedReports =
    totalAcceptedReportsData[0]?.totalAcceptedReports || 0;

  if (result === REPORT_STATUS.accepted && isBlocked) {
    switch (report.reportType) {
      case REPORT_TYPE.reel:
        const reel = await Reel.findByIdAndUpdate(
          report?.reel?._id,
          {
            status: STATUS_TYPE.blocked,
            updatedBy: userId,
            updatedAt: new Date().toISOString(),
          },
          { new: true }
        ).exec();
        responseIsBlocked = reel?.status === STATUS_TYPE.blocked;
        break;
      case REPORT_TYPE.comment:
        const comment = await Comment.findByIdAndUpdate(
          report?.comment?._id,
          {
            status: STATUS_TYPE.blocked,
            updatedBy: userId,
            updatedAt: new Date().toISOString(),
          },
          { new: true }
        ).exec();
        responseIsBlocked = comment?.status === STATUS_TYPE.blocked;
        break;
      case REPORT_TYPE.reply:
        const updatedComment = await Comment.findOneAndUpdate(
          { _id: report?.comment?._id, 'replies._id': report?.reply },
          {
            $set: {
              'replies.$.status': STATUS_TYPE.blocked,
              'replies.$.updatedBy': userId,
              'replies.$.updatedAt': new Date().toISOString(),
            },
          },
          { new: true }
        ).exec();
        const foundReply = updatedComment?.replies?.find(
          (r: any) => r._id.toString() === report?.reply?.toString()
        );
        responseIsBlocked = foundReply?.status === STATUS_TYPE.blocked;
        break;
    }
  }

  res.status(200).json({
    success: true,
    data: {
      totalAcceptedReports,
      id: responseId,
      isBlocked: responseIsBlocked,
    },
    message: t('report_validated'),
  });
});

export const statusChange = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id, status } = req.body;
    if (!id || !status) {
      res.status(400);
      throw new Error('invalid_request');
    }
    if (status !== STATUS_TYPE.active) {
      res.status(400);
      throw new Error('invalid_status');
    }
    const report = await Report.findByIdAndUpdate(id, {
      status: status,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    }).exec();
    if (!report) {
      res.status(404);
      throw new Error('report_not_found');
    }
    res.status(200).json({
      success: true,
      message: t('status_changed'),
    });
  } catch (error) {
    throw error;
  }
});

export const getReportsAggregate = () => {
  return [
    {
      $lookup: {
        from: 'users',
        localField: 'reportedBy',
        foreignField: '_id',
        as: 'reportedBy',
      },
    },
    { $unwind: { path: '$reportedBy', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'users',
        localField: 'reviewedBy',
        foreignField: '_id',
        as: 'reviewedBy',
      },
    },
    { $unwind: { path: '$reviewedBy', preserveNullAndEmptyArrays: true } },
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
        localField: 'reel.createdBy',
        foreignField: '_id',
        as: 'reel.createdBy',
      },
    },
    {
      $unwind: { path: '$reel.createdBy', preserveNullAndEmptyArrays: true },
    },
    {
      $lookup: {
        from: 'comments',
        localField: 'comment',
        foreignField: '_id',
        as: 'comment',
      },
    },
    { $unwind: { path: '$comment', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'users',
        localField: 'comment.commentedBy',
        foreignField: '_id',
        as: 'comment.createdBy',
      },
    },
    {
      $unwind: {
        path: '$comment.createdBy',
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $addFields: {
        replyObj: {
          $first: {
            $filter: {
              input: '$comment.replies',
              as: 'reply',
              cond: { $eq: ['$$reply._id', '$reply'] },
            },
          },
        },
      },
    },
    {
      $lookup: {
        from: 'users',
        localField: 'replyObj.repliedBy',
        foreignField: '_id',
        as: 'replyUser',
      },
    },
    { $unwind: { path: '$replyUser', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        'replyObj.createdBy': '$replyUser',
      },
    },
  ];
};

export const getContentReportsAggregation = (
  {
    id,
    search,
    result,
    sortBy,
    sortOrder,
    startDate,
    endDate,
    page = 1,
    limit = 10,
  }: any,
  type: string
) => {
  const skip = (page - 1) * limit;
  const matchQuery: any = {};
  const sortQuery: any = {};
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
  if (
    sortOrder &&
    sortBy &&
    (sortOrder === 'asc' || sortOrder === 'desc') &&
    ['createdAt', 'updatedAt', 'reviewedAt', 'totalAcceptedReports'].includes(
      sortBy
    )
  ) {
    sortQuery[sortBy] = sortOrder === 'asc' ? 1 : -1;
  } else {
    sortQuery.createdAt = -1;
  }

  if (result) {
    matchQuery.result = String(result);
  }

  const objectId = mongoose.Types.ObjectId.isValid(id)
    ? new mongoose.Types.ObjectId(String(id))
    : id;

  let typeMatch;
  switch (type) {
    case REPORT_TYPE.reel:
      typeMatch = {
        $and: [
          { $eq: ['$reportType', REPORT_TYPE.reel] },
          { $eq: ['$reel._id', objectId] },
        ],
      };
      break;
    case REPORT_TYPE.comment:
      typeMatch = {
        $or: [
          {
            $and: [
              { $eq: ['$reportType', REPORT_TYPE.comment] },
              { $eq: ['$comment._id', objectId] },
            ],
          },
          {
            $and: [
              { $eq: ['$reportType', REPORT_TYPE.reply] },
              { $eq: ['$replyObj._id', objectId] },
            ],
          },
        ],
      };
      break;
  }
  const reportAggregations = getReportsAggregate();
  const pipeline = [
    { $match: matchQuery },
    ...reportAggregations,
    { $match: { $expr: typeMatch } },
    {
      $project: {
        _id: 0,
        id: '$_id',
        totalAcceptedReports: '$totalAcceptedReports',
        reel: {
          id: '$reel._id',
          caption: '$reel.caption',
          isBlocked: { $eq: ['$reel.status', STATUS_TYPE.blocked] },
          status: '$reel.status',
          totalViews: '$reel.totalViews',
          totalLikes: '$reel.totalLikes',
          totalComments: '$reel.totalComments',
          media: {
            $cond: [
              { $eq: ['$reel.mediaType', MEDIA_TYPE.image] },
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
                $concat: [
                  config.host + '/api/reel/view/',
                  { $toString: '$reel._id' },
                ],
              },
            ],
          },
          mediaType: '$reel.mediaType',
          thumbnail: {
            $cond: [
              { $ifNull: ['$reel.thumbnail', false] },
              {
                $concat: [config.host + '/thumbnail/', '$reel.thumbnail'],
              },
              '$$REMOVE',
            ],
          },
          createdBy: {
            id: '$reel.createdBy._id',
            name: '$reel.createdBy.name',
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
        },
        comment: {
          $cond: [
            { $eq: ['$reportType', REPORT_TYPE.reply] },
            {
              id: '$replyObj._id',
              isBlocked: { $eq: ['$replyObj.status', STATUS_TYPE.blocked] },
              content: '$replyObj.content',
              status: '$replyObj.status',
              commentId: '$comment._id',
              commentContent: '$comment.content',
              createdBy: {
                id: '$replyObj.createdBy._id',
                name: '$replyObj.createdBy.name',
                profile: {
                  $cond: {
                    if: { $not: ['$replyObj.createdBy.profile'] },
                    then: '$$REMOVE',
                    else: {
                      $concat: [
                        config.host + '/profile/',
                        '$replyObj.createdBy.profile',
                      ],
                    },
                  },
                },
              },
            },
            {
              $cond: [
                { $eq: ['$reportType', REPORT_TYPE.comment] },
                {
                  id: '$comment._id',
                  isBlocked: {
                    $eq: ['$comment.status', STATUS_TYPE.blocked],
                  },
                  content: '$comment.content',
                  status: '$comment.status',
                  createdBy: {
                    id: '$comment.createdBy._id',
                    name: '$comment.createdBy.name',
                    profile: {
                      $cond: {
                        if: { $not: ['$comment.createdBy.profile'] },
                        then: '$$REMOVE',
                        else: {
                          $concat: [
                            config.host + '/profile/',
                            '$comment.createdBy.profile',
                          ],
                        },
                      },
                    },
                  },
                },
                '$$REMOVE',
              ],
            },
          ],
        },
        reportedBy: {
          id: '$reportedBy._id',
          name: '$reportedBy.name',
          profile: {
            $cond: {
              if: { $not: ['$reportedBy.profile'] },
              then: '$$REMOVE',
              else: {
                $concat: [config.host + '/profile/', '$reportedBy.profile'],
              },
            },
          },
        },
        reason: 1,
        reportType: 1,
        status: 1,
        reviewedBy: {
          $cond: {
            if: { $not: ['$reviewedAt'] },
            then: '$$REMOVE',
            else: {
              id: '$reviewedBy._id',
              name: '$reviewedBy.name',
              profile: {
                $cond: {
                  if: { $not: ['$reviewedBy.profile'] },
                  then: '$$REMOVE',
                  else: {
                    $concat: [config.host + '/profile/', '$reviewedBy.profile'],
                  },
                },
              },
            },
          },
        },
        reviewedAt: {
          $cond: {
            if: { $not: ['$reviewedAt'] },
            then: '$$REMOVE',
            else: '$reviewedAt',
          },
        },
        notes: {
          $cond: {
            if: { $not: ['$notes'] },
            then: '$$REMOVE',
            else: '$notes',
          },
        },
        result: 1,
        createdAt: 1,
        updatedAt: 1,
      },
    },
    ...(search
      ? [
          {
            $match: {
              $or: [
                { 'reel.title': { $regex: search, $options: 'i' } },
                { 'comment.text': { $regex: search, $options: 'i' } },
              ],
            },
          },
        ]
      : []),
    { $sort: sortQuery },
    {
      $facet: {
        reports: [{ $skip: Number(skip) }, { $limit: Number(limit) }],
        pagination: [{ $count: 'total' }],
      },
    },
  ];

  return { pipeline, limit: Number(limit) };
};
export const getReportedUsers = expressAsyncHandler(async (req: any, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;
    const search = req.query.search;
    const status = req.query.status;
    const startDate = req.query.startDate
      ? parseISO(req.query.startDate)
      : null;
    const endDate = req.query.endDate ? parseISO(req.query.endDate) : null;
    const sortBy = req.query.sortBy;
    const sortOrder = req.query.sortOrder;
    const sortQuery: any = {};
    if (
      sortBy &&
      sortOrder &&
      (sortOrder === 'asc' || sortOrder === 'desc') &&
      [
        'createdAt',
        'updatedAt',
        'totalReports',
        'totalPendingReports',
        'totalAcceptedReports',
        'totalRejectedReports',
      ].includes(sortBy)
    ) {
      sortQuery[sortBy] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sortQuery.totalReports = -1;
    }
    const matchQuery: any = {};
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
    const reportAggregations = getReportsAggregate();
    const reportsData = await Report.aggregate([
      { $match: matchQuery },
      ...reportAggregations,
      {
        $addFields: {
          offender: {
            $switch: {
              branches: [
                {
                  case: { $eq: ['$reportType', REPORT_TYPE.reel] },
                  then: '$reel.createdBy._id',
                },
                {
                  case: { $eq: ['$reportType', REPORT_TYPE.comment] },
                  then: '$comment.createdBy._id',
                },
                {
                  case: { $eq: ['$reportType', REPORT_TYPE.reply] },
                  then: '$replyObj.createdBy._id',
                },
              ],
              default: null,
            },
          },
        },
      },
      {
        $group: {
          _id: '$offender',
          totalReports: { $sum: 1 },
          totalPendingReports: {
            $sum: {
              $cond: [{ $eq: ['$result', REPORT_STATUS.pending] }, 1, 0],
            },
          },
          totalAcceptedReports: {
            $sum: {
              $cond: [{ $eq: ['$result', REPORT_STATUS.accepted] }, 1, 0],
            },
          },
          totalRejectedReports: {
            $sum: {
              $cond: [{ $eq: ['$result', REPORT_STATUS.rejected] }, 1, 0],
            },
          },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      {
        $unwind: '$user',
      },
      {
        $lookup: {
          from: 'roles',
          localField: 'user.role',
          foreignField: '_id',
          as: 'role',
        },
      },
      {
        $unwind: '$role',
      },
      {
        $match: {
          'role.name': { $eq: UserRole.User },
        },
      },
      {
        $project: {
          _id: 0,
          id: '$_id',
          totalReports: 1,
          totalPendingReports: 1,
          totalAcceptedReports: 1,
          totalRejectedReports: 1,
          name: '$user.name',
          email: '$user.email',
          phone: '$user.phone',
          displayName: '$user.displayName',
          description: '$user.description',
          status: '$user.status',
          createdAt: '$user.createdAt',
          updatedAt: '$user.updatedAt',
          createdBy: '$user.createdBy',
          updatedBy: '$user.updatedBy',
          profile: {
            $cond: {
              if: { $not: ['$user.profile'] },
              then: '$$REMOVE',
              else: {
                $concat: [config.host + '/profile/', '$user.profile'],
              },
            },
          },
        },
      },
      {
        $match: search
          ? {
              $or: [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { displayName: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { gender: { $regex: search, $options: 'i' } },
              ],
            }
          : {},
      },
      {
        $match: status
          ? { status: status }
          : {
              status: { $ne: STATUS_TYPE.blocked },
            },
      },
      {
        $facet: {
          data: [
            { $sort: sortQuery ? sortQuery : { totalReports: -1 } },
            { $skip: skip },
            { $limit: limit },
          ],
          pagination: [{ $count: 'total' }],
        },
      },
    ]).exec();
    const total = reportsData[0]?.pagination[0]?.total || 0;
    const data = reportsData[0]?.data || [];
    res.status(200).json({
      success: true,
      data: {
        users: data,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    throw error;
  }
});
