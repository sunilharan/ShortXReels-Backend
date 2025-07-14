import expressAsyncHandler from 'express-async-handler';
import { Report } from '../models/report.model';
import { ObjectId } from 'mongodb';
import { UserRole, STATUS } from '../config/constants';
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
    let createData: any = {};
    if (!reel || !ObjectId.isValid(reel)) {
      res.status(400);
      throw new Error('invalid_reel_id');
    }
    if (!reason || typeof reason !== 'string' || reason.trim() === '') {
      res.status(400);
      throw new Error('reason_required');
    }
    if (comment && !ObjectId.isValid(comment)) {
      res.status(400);
      throw new Error('invalid_comment_id');
    }
    if (reply && !ObjectId.isValid(reply)) {
      res.status(400);
      throw new Error('invalid_reply_id');
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
        _id: comment,
        replies: { $elemMatch: { _id: reply } },
      }).exec();
      if (!replyExists) {
        res.status(404);
        throw new Error('reply_not_found');
      }
    }
    createData.reportedBy = new ObjectId(userId);
    createData.reel = new ObjectId(reel);
    createData.reason = reason;
    createData.reportType = reportType;
    if (comment) {
      createData.comment = new ObjectId(comment);
    }
    if (reply) {
      createData.reply = new ObjectId(reply);
    }
    const alreadyReported = await Report.findOne({
      reportedBy: new ObjectId(userId),
      reel: new ObjectId(reel),
      comment: new ObjectId(comment),
      reply: new ObjectId(reply),
      reason: reason,
      reportType: reportType,
    }).exec();
    if (!alreadyReported) {
      const report = await Report.create(createData);
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
    const role = req.role;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const search = (req.query.search as string) || '';
    const reviewBy = req.query.reviewBy as string;
    const reviewResultValid = req.query.reviewResultValid;
    const status = req.query.status as string;
    const reportType = req.query.reportType as string;

    const matchQuery: any = {};
    if (role === UserRole.User) {
      matchQuery.reportedBy = new ObjectId(userId);
    }
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      matchQuery.$or = [{ reason: searchRegex }];
    }
    if (reportType) matchQuery.reportType = reportType;
    if (reviewBy) matchQuery.reviewBy = new ObjectId(reviewBy);
    if (reviewResultValid !== undefined) {
      matchQuery.reviewResultValid = reviewResultValid === 'true';
    }
    if (status) {
      matchQuery.status = status;
    } else {
      matchQuery.status = { $ne: STATUS.deleted };
    }

    const reportsAggregate = await Report.aggregate([
      { $match: matchQuery },
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
          from: 'comments',
          localField: 'comment',
          foreignField: '_id',
          as: 'comment',
        },
      },
      { $unwind: { path: '$comment', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'comments',
          localField: 'reply',
          foreignField: 'replies._id',
          as: 'replyData',
        },
      },
      {
        $addFields: {
          replyObj: {
            $first: {
              $map: {
                input: '$replyData',
                as: 'item',
                in: {
                  $arrayElemAt: ['$$item.replies', 0],
                },
              },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          id: '$_id',
          reel: {
            $cond: [
              { $eq: ['$reportType', 'reel'] },
              {
                id: '$reel._id',
                caption: '$reel.caption',
                media: {
                  $cond: [
                    { $eq: ['$reel.mediaType', 'image'] },
                    {
                      $map: {
                        input: '$reel.media',
                        as: 'img',
                        in: { $concat: [config.host + '/reel/', '$$img'] },
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
              },
              '$$REMOVE',
            ],
          },
          comment: {
            $cond: [
              { $eq: ['$reportType', 'comment'] },
              {
                id: '$comment._id',
                content: '$comment.content',
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
                    { $ifNull: ['$reportedBy.profile', false] }
                  ]
                },
                { $concat: [config.host + '/profile/', '$reportedBy.profile'] },
                '$$REMOVE'
              ]
            }
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
                        { $ifNull: ['$reviewBy.profile', false] }
                      ]
                    },
                    { $concat: [config.host + '/profile/', '$reviewBy.profile'] },
                    '$$REMOVE'
                  ]
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
          reviewResultValid: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
      { $sort: { createdAt: -1 } },
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

export const deleteReport = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const role = req.role;
    const { id } = req.params;

    if (!id || !ObjectId.isValid(id)) {
      res.status(400);
      throw new Error('invalid_report_id');
    }
    let report;
    if (role === UserRole.SuperAdmin || role === UserRole.Admin) {
      report = await Report.findByIdAndUpdate(id, {
        status: STATUS.deleted,
      }).exec();
    } else {
      report = await Report.findOneAndUpdate(
        {
          _id: new ObjectId(id),
          reportedBy: new ObjectId(userId),
          status: { $ne: STATUS.deleted },
        },
        {
          status: STATUS.deleted,
        }
      ).exec();
    }
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
    const role = req.role;
    const { id, reviewResultValid } = req.body;

    if (!id || !ObjectId.isValid(id)) {
      res.status(400);
      throw new Error('invalid_report_id');
    }

    if (typeof reviewResultValid !== 'boolean') {
      res.status(400);
      throw new Error('invalid_review_validated');
    }
    const report = await Report.findByIdAndUpdate(
      id,
      {
        reviewBy: new ObjectId(userId),
        reviewResultValid: reviewResultValid,
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
    if (report.reviewResultValid) {
      await Reel.findByIdAndUpdate(report.reel, {
        status: STATUS.inactive,
      }).exec();
    }
    res.status(200).json({
      success: true,
      message: t('report_validated'),
    });
  } catch (error: any) {
    throw error;
  }
});
