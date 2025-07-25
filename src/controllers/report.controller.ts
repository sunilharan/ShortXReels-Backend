import expressAsyncHandler from 'express-async-handler';
import { Report } from '../models/report.model';
import mongoose from 'mongoose';
import { REPORT_STATUS, STATUS_TYPE } from '../config/enums';
import { Reel } from '../models/reel.model';
import { t } from 'i18next';
import { Comment } from '../models/comments.model';
import { config } from '../config/config';

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
      await Report.create(createData);
    }
    res.status(201).json({
      success: true,
      data: true,
      message: t('report_created'),
    });
  } catch (error: any) {
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
    const reviewBy = req.query.reviewBy;
    const reportedBy = req.query.reportedBy;
    const reviewResult = req.query.reviewResult;
    const status = req.query.status;
    const reportType = req.query.reportType;
    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    const matchQuery: any = {};
    if (search) {
      matchQuery.$or = [
        { reason: { $regex: search, $options: 'i' } },
        { reviewNotes: { $regex: search, $options: 'i' } },
      ];
    }
    if (startDate && endDate) {
      matchQuery.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }
    if (reportType) matchQuery.reportType = reportType;
    if (reviewBy)
      matchQuery.reviewBy = new mongoose.Types.ObjectId(String(reviewBy));
    if (reviewResult) {
      matchQuery.reviewResult = reviewResult;
    }
    if (reportedBy)
      matchQuery.reportedBy = new mongoose.Types.ObjectId(String(reportedBy));
    if (status) {
      matchQuery.status = status;
    } else {
      matchQuery.status = { $ne: STATUS_TYPE.deleted };
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
                $cond: [
                  {
                    $and: [
                      { $ne: ['$reel.createdBy.profile', null] },
                      { $ne: ['$reel.createdBy.profile', ''] },
                      { $ifNull: ['$reel.createdBy.profile', false] },
                    ],
                  },
                  {
                    $concat: [
                      config.host + '/profile/',
                      '$reel.createdBy.profile',
                    ],
                  },
                  '$$REMOVE',
                ],
              },
            },
          },
          comment: {
            $cond: [
              { $in: ['$reportType', ['comment', 'reply']] },
              {
                id: '$comment._id',
                content: '$comment.content',
                createdBy: {
                  id: '$comment.createdBy._id',
                  name: '$comment.createdBy.name',
                  profile: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ['$comment.createdBy.profile', null] },
                          { $ne: ['$comment.createdBy.profile', ''] },
                          { $ifNull: ['$comment.createdBy.profile', false] },
                        ],
                      },
                      {
                        $concat: [
                          config.host + '/profile/',
                          '$comment.createdBy.profile',
                        ],
                      },
                      '$$REMOVE',
                    ],
                  },
                },
              },
              '$$REMOVE',
            ],
          },
          reply: {
            $cond: [
              { $eq: ['$reportType', 'reply'] },
              {
                id: '$replyObj._id',
                content: '$replyObj.content',
                createdBy: {
                  id: '$replyObj.createdBy._id',
                  name: '$replyObj.createdBy.name',
                  profile: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ['$replyObj.createdBy.profile', null] },
                          { $ne: ['$replyObj.createdBy.profile', ''] },
                          { $ifNull: ['$replyObj.createdBy.profile', false] },
                        ],
                      },
                      {
                        $concat: [
                          config.host + '/profile/',
                          '$replyObj.createdBy.profile',
                        ],
                      },
                      '$$REMOVE',
                    ],
                  },
                },
              },
              '$$REMOVE',
            ],
          },
          reportedBy: {
            id: '$reportedBy._id',
            name: '$reportedBy.name',
            profile: {
              $cond: [
                {
                  $and: [
                    { $ne: ['$reportedBy.profile', null] },
                    { $ne: ['$reportedBy.profile', ''] },
                    { $ifNull: ['$reportedBy.profile', false] },
                  ],
                },
                {
                  $concat: [config.host + '/profile/', '$reportedBy.profile'],
                },
                '$$REMOVE',
              ],
            },
          },
          reason: 1,
          reportType: 1,
          status: 1,
          reviewBy: {
            $cond: [
              { $ifNull: ['$reviewDate', false] },
              {
                id: '$reviewBy._id',
                name: '$reviewBy.name',
                profile: {
                  $cond: [
                    {
                      $and: [
                        { $ne: ['$reviewBy.profile', null] },
                        { $ne: ['$reviewBy.profile', ''] },
                        { $ifNull: ['$reviewBy.profile', false] },
                      ],
                    },
                    {
                      $concat: [config.host + '/profile/', '$reviewBy.profile'],
                    },
                    '$$REMOVE',
                  ],
                },
              },
              '$$REMOVE',
            ],
          },
          reviewDate: {
            $cond: [
              { $ifNull: ['$reviewDate', false] },
              '$reviewDate',
              '$$REMOVE',
            ],
          },
          reviewResult: 1,
          reviewNotes: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      { $skip: skip },
      { $limit: limit },
    ]);

    const total = await Report.countDocuments(matchQuery);

    res.status(200).json({
      success: true,
      data: {
        reports: reportsAggregate,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    throw error;
  }
});

export const getOffenderUsers = expressAsyncHandler(async (req: any, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;
  const search = req.query.search;
  const status = req.query.status;
  const reportType = req.query.reportType;
  const minValidReportCount =
    parseInt(req.query.minValidReportCount as string) || 3;
  const startDate = req.query.startDate;
  const endDate = req.query.endDate;
  const matchQuery: any = {};
  matchQuery.reviewResult = REPORT_STATUS.resolved;
  matchQuery.status = { $ne: STATUS_TYPE.deleted };
  if (search) {
    matchQuery.$or = [
      { reason: { $regex: search, $options: 'i' } },
      { reviewNotes: { $regex: search, $options: 'i' } },
    ];
  }
  if (startDate && endDate) {
    matchQuery.createdAt = {
      $gte: new Date(startDate),
      $lte: new Date(endDate),
    };
  }
  if (reportType) matchQuery.reportType = reportType;
  if (status) matchQuery.status = status;

  const reportAggregations = getReportsAggregate();
  const offenders = await Report.aggregate([
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
        reports: { $push: '$$ROOT' },
        count: { $sum: 1 },
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
      $project: {
        _id: 0,
        id: '$_id',
        count: 1,
        name: '$user.name',
        status: '$user.status',
        profile: {
          $cond: {
            if: {
              $or: [
                { $eq: ['$user.profile', null] },
                { $eq: ['$user.profile', ''] },
                { $not: ['$user.profile'] },
              ],
            },
            then: '$$REMOVE',
            else: {
              $concat: [config.host + '/profile/', '$user.profile'],
            },
          },
        },
        reports: {
          $map: {
            input: '$reports',
            as: 'report',
            in: {
              reason: '$$report.reason',
              reportType: '$$report.reportType',
              status: '$$report.status',
              reviewDate: '$$report.reviewDate',
              reviewNotes: '$$report.reviewNotes',
              createdAt: '$$report.createdAt',
              updatedAt: '$$report.updatedAt',
              reel: {
                id: '$$report.reel._id',
                caption: '$$report.reel.caption',
                thumbnail: '$$report.reel.thumbnail',
                mediaType: '$$report.reel.mediaType',
                status: '$$report.reel.status',
                media: {
                  $cond: [
                    { $eq: ['$$report.reel.mediaType', 'image'] },
                    {
                      $map: {
                        input: '$$report.reel.media',
                        as: 'img',
                        in: {
                          $concat: [config.host, '/reel/', '$$img'],
                        },
                      },
                    },
                    {
                      $concat: [
                        config.host + '/api/reel/view/',
                        { $toString: '$$report.reel._id' },
                      ],
                    },
                  ],
                },
              },
              comment: {
                $cond: [
                  { $in: ['$$report.reportType', ['comment', 'reply']] },
                  {
                    id: '$$report.comment._id',
                    content: '$$report.comment.content',
                    status: '$$report.comment.status',
                  },
                  '$$REMOVE',
                ],
              },
              reply: {
                $cond: [
                  { $eq: ['$$report.reportType', 'reply'] },
                  {
                    id: '$$report.replyObj._id',
                    content: '$$report.replyObj.content',
                    status: '$$report.replyObj.status',
                  },
                  '$$REMOVE',
                ],
              },
            },
          },
        },
      },
    },
    { $sort: { count: -1 } },
    { $skip: skip },
    { $limit: limit },
  ]);

  res.json({
    success: true,
    data: {
      offenders,
      minValidReportCount,
    },
  });
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
  } catch (error: any) {
    throw error;
  }
});

export const validateReport = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id, reviewResult, reviewNotes } = req.body;

    if (!id) {
      res.status(400);
      throw new Error('invalid_request');
    }

    if (
      reviewResult === REPORT_STATUS.resolved &&
      reviewResult === REPORT_STATUS.rejected
    ) {
      res.status(400);
      throw new Error('invalid_review_validated');
    }
    const report = await Report.findByIdAndUpdate(
      id,
      {
        reviewBy: new mongoose.Types.ObjectId(String(userId)),
        reviewResult: reviewResult,
        reviewNotes: reviewNotes,
        reviewDate: new Date(),
      },
      {
        new: true,
      }
    )
      .populate('reportedBy', 'name profile')
      .populate('reel', 'caption video')
      .populate('reviewBy', 'name profile')
      .exec();

    if (!report) {
      res.status(404);
      throw new Error('report_not_found');
    }
    if (report.reviewResult === REPORT_STATUS.resolved) {
      if (report.reportType === 'reel') {
        await Reel.findByIdAndUpdate(report.reel, {
          status: STATUS_TYPE.blocked,
        }).exec();
      } else if (report.reportType === 'comment') {
        await Comment.findByIdAndUpdate(report.comment, {
          status: STATUS_TYPE.blocked,
        }).exec();
      } else if (report.reportType === 'reply') {
        await Comment.findOneAndUpdate(
          { _id: report.comment, 'replies._id': report.reply },
          { $set: { 'replies.$.status': STATUS_TYPE.blocked } }
        ).exec();
      }
    }
    res.status(200).json({
      success: true,
      message: t('report_validated'),
    });
  } catch (error: any) {
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
        localField: 'reviewBy',
        foreignField: '_id',
        as: 'reviewBy',
      },
    },
    { $unwind: { path: '$reviewBy', preserveNullAndEmptyArrays: true } },
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
