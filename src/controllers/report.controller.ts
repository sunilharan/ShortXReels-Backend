import expressAsyncHandler from 'express-async-handler';
import { Report } from '../models/report.model';
import mongoose from 'mongoose';
import { REPORT_STATUS, REPORT_TYPE, STATUS_TYPE } from '../config/enums';
import { Reel } from '../models/reel.model';
import { t } from 'i18next';
import { Comment } from '../models/comment.model';
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
    if (!reelExists) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    if (comment) {
      const commentExists = await Comment.findById(comment).exec();
      if (!commentExists) {
        res.status(404);
        throw new Error('comment_not_found');
      }
    }
    if (reply) {
      const replyExists = await Comment.findOne({
        _id: new mongoose.Types.ObjectId(String(comment)),
        replies: {
          $elemMatch: { _id: new mongoose.Types.ObjectId(String(reply)) },
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
      ['createdAt', 'updatedAt', 'reviewedAt'].includes(sortBy)
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
        $project: {
          _id: 0,
          id: '$_id',
          reel: {
            id: '$reel._id',
            caption: '$reel.caption',
            media: {
              $cond: [
                { $eq: ['$reel.mediaType', 'image'] },
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
              { $eq: ['$reportType', 'reply'] },
              {
                id: '$replyObj._id',
                content: '$replyObj.content',
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
                  { $eq: ['$reportType', 'comment'] },
                  {
                    id: '$comment._id',
                    content: '$comment.content',
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
              ],
            }
          : {},
      },
      {
        $match: reportedTo
          ? {
              $expr: {
                $cond: [
                  { $eq: ['$reportType', 'reel'] },
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

export const validateReport = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id, result, notes } = req.body;

    if (!id) {
      res.status(400);
      throw new Error('invalid_request');
    }

    if (
      result === REPORT_STATUS.accepted &&
      result === REPORT_STATUS.rejected
    ) {
      res.status(400);
      throw new Error('invalid_review_validated');
    }
    const report = await Report.findByIdAndUpdate(
      id,
      {
        reviewedBy: new mongoose.Types.ObjectId(String(userId)),
        result: result,
        notes: notes,
        reviewedAt: new Date(),
      },
      {
        new: true,
      }
    )
      .populate([
        { path: 'reportedBy', select: 'name profile' },
        { path: 'reel', select: 'caption video' },
        { path: 'reviewedBy', select: 'name profile' },
      ])
      .exec();

    if (!report) {
      res.status(404);
      throw new Error('report_not_found');
    }
    if (report.result === REPORT_STATUS.accepted) {
      if (report.reportType === 'reel') {
        await Reel.findByIdAndUpdate(report.reel, {
          status: STATUS_TYPE.blocked,
          updatedBy: userId,
          updatedAt: new Date().toISOString(),
        }).exec();
      } else if (report.reportType === 'comment') {
        await Comment.findByIdAndUpdate(report.comment, {
          status: STATUS_TYPE.blocked,
          updatedBy: userId,
          updatedAt: new Date().toISOString(),
        }).exec();
      } else if (report.reportType === 'reply') {
        await Comment.findOneAndUpdate(
          { _id: report.comment, 'replies._id': report.reply },
          {
            $set: {
              'replies.$.status': STATUS_TYPE.blocked,
              'replies.$.updatedBy': userId,
              'replies.$.updatedAt': new Date().toISOString(),
            },
          }
        ).exec();
      }
    }
    res.status(200).json({
      success: true,
      message: t('report_validated'),
    });
  } catch (error) {
    throw error;
  }
});

export const statusChange = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.body;
    if (!id) {
      throw new Error('invalid_request');
    }
    const report = await Report.findByIdAndUpdate(id, {
      status: STATUS_TYPE.blocked,
      updatedBy: userId,
      updatedAt: new Date().toISOString(),
    }).exec();
    if (!report) throw new Error('report_not_found');
    res.status(200).json({
      success: true,
      message: t('data_blocked'),
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
    if (sortBy && sortOrder) {
      sortQuery[sortBy] = sortOrder === 'desc' ? -1 : 1;
      if (
        ![
          'totalReports',
          'totalPendingReports',
          'totalAcceptedReports',
          'totalRejectedReports',
        ].includes(sortBy) ||
        !['asc', 'desc'].includes(sortOrder)
      ) {
        sortQuery.totalReports = sortOrder === 'desc' ? -1 : 1;
      }
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
                  case: { $eq: ['$reportType', 'reel'] },
                  then: '$reel.createdBy._id',
                },
                {
                  case: { $eq: ['$reportType', 'comment'] },
                  then: '$comment.createdBy._id',
                },
                {
                  case: { $eq: ['$reportType', 'reply'] },
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
