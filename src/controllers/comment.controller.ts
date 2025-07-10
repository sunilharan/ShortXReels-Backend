import expressAsyncHandler from 'express-async-handler';
import { Comment } from '../models/comments.model';
import { ObjectId } from 'mongodb';
import { Reel } from '../models/reel.model';
import { LIKE, UserRole } from '../config/constants';
import { t } from 'i18next';
import { config } from '../config/config';

export const createComment = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const { reelId: reel, content, commentId } = req.body;

    if (!reel || !ObjectId.isValid(reel)) {
      res.status(400);
      throw new Error('invalid_reel_id');
    }
    if (!content || typeof content !== 'string' || content.trim() === '') {
      res.status(400);
      throw new Error('invalid_content');
    }
    const reelExists = await Reel.findById(reel).exec();
    if (!reelExists) {
      res.status(404);
      throw new Error('reel_not_found');
    }

    let comment;

    if (commentId) {
      const commentExists = await Comment.findById(commentId).exec();
      if (!commentExists) {
        res.status(404);
        throw new Error('comment_not_found');
      }

      const reply = {
        repliedBy: userId,
        content,
      };

      await Comment.findByIdAndUpdate(
        commentId,
        { $addToSet: { replies: reply } },
        { new: true }
      ).exec();

      comment = await Comment.findById(commentId).exec();
    } else {
      comment = await Comment.create({
        commentedBy: userId,
        reel,
        content,
      });
    }

    if (!comment) {
      res.status(400);
      throw new Error('comment_creation_failed');
    }

    const commentData = await fetchComments(userId, { _id: comment._id });
    const totalcomments = await Comment.countDocuments({
      reel: new ObjectId(reel),
    }).exec();

    res.status(201).json({
      success: true,
      data: {
        comment: commentData[0],
        totalComments: totalcomments,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || 'Something went wrong',
    });
  }
});

export const getCommentsByReel = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const reelId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    if (!reelId || !ObjectId.isValid(reelId)) {
      res.status(400);
      throw new Error('invalid_reel_id');
    }
    const reelExists = await Reel.findById(reelId).exec();
    if (!reelExists) {
      res.status(404);
      throw new Error('reel_not_found');
    }

    const comments = await fetchComments(
      userId,
      { reel: new ObjectId(reelId) },
      { skip, limit }
    );

    const total = await Comment.countDocuments({ reel: reelId });
    res.status(200).json({
      success: true,
      data: {
        comments,
        totalRecords: total,
        totalComments: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    throw error;
  }
});

export const getById = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const commentId = req.params.id;

    if (!commentId || !ObjectId.isValid(commentId)) {
      res.status(400);
      throw new Error('invalid_comment_id');
    }
    const comment = await Comment.findById(commentId)
      .populate('commentedBy', 'name profile')
      .populate('likedBy', 'name profile')
      .populate('replies.repliedBy', 'name profile')
      .populate('replies.likedBy', 'name profile')
      .sort({ createdAt: -1 })
      .exec();
    if (!comment) {
      res.status(404);
      throw new Error('comment_not_found');
    }

    res.status(200).json({
      success: true,
      data: comment,
    });
  } catch (error: any) {
    throw error;
  }
});

export const deleteComment = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const commentId = req.query.commentId;
    const replyId = req.query.replyId;

    if (!commentId || !ObjectId.isValid(commentId)) {
      res.status(400);
      throw new Error('invalid_comment_id');
    }
    let comment;
    if (!replyId) {
      if (req.role === UserRole.SuperAdmin || req.role === UserRole.Admin) {
        comment = await Comment.findByIdAndDelete(commentId);
      } else {
        comment = await Comment.findOneAndDelete({
          _id: new ObjectId(commentId),
          commentedBy: new ObjectId(userId),
        });
      }
    } else {
      if (req.role === UserRole.SuperAdmin || req.role === UserRole.Admin) {
        comment = await Comment.findOneAndUpdate(
          {
            _id: new ObjectId(commentId),
            'replies._id': new ObjectId(replyId),
          },
          {
            $pull: {
              replies: {
                _id: new ObjectId(replyId),
              },
            },
          },
          { new: true }
        );
      } else {
        comment = await Comment.findOneAndUpdate(
          {
            _id: new ObjectId(commentId),
            'replies._id': new ObjectId(replyId),
            'replies.repliedBy': new ObjectId(userId),
          },
          {
            $pull: {
              replies: {
                _id: new ObjectId(replyId),
              },
            },
          }
        );
      }
    }
    if (!comment) {
      res.status(404);
      throw new Error('comment_not_found');
    }
    const reel = await Reel.findById(comment?.reel).exec();
    if (!reel) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    const totalComments = await Comment.countDocuments({
      reel: new ObjectId(reel?.id),
    });
    res.status(200).json({
      success: true,
      data: totalComments,
      message: t('comment_deleted'),
    });
  } catch (error: any) {
    throw error;
  }
});

export const likeUnlikeComment = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const { commentId, replyId, action } = req.body;

    if (!action || (action !== LIKE.like && action !== LIKE.unlike)) {
      res.status(400);
      throw new Error('invalid_action');
    }
    if (!commentId || !ObjectId.isValid(commentId)) {
      res.status(400);
      throw new Error('invalid_comment_id');
    }

    if (replyId && !ObjectId.isValid(replyId)) {
      res.status(400);
      throw new Error('invalid_reply_id');
    }

    const userObjectId = new ObjectId(userId);

    if (replyId) {
      const commentDoc = await Comment.findOne(
        { _id: commentId, 'replies._id': replyId },
        { 'replies.$': 1 }
      ).exec();

      if (!commentDoc || !commentDoc.replies?.length) {
        res.status(404);
        throw new Error('reply_not_found');
      }

      const reply = commentDoc.replies[0];
      const alreadyLiked = reply.likedBy.some(
        (uid: any) => uid.toString() === userId
      );

      let updateQuery: any = {};
      if (action === LIKE.like && !alreadyLiked) {
        updateQuery = { $addToSet: { 'replies.$.likedBy': userObjectId } };
      } else if (action === LIKE.unlike && alreadyLiked) {
        updateQuery = { $pull: { 'replies.$.likedBy': userObjectId } };
      }

      if (Object.keys(updateQuery).length > 0) {
        await Comment.findOneAndUpdate(
          { _id: commentId, 'replies._id': replyId },
          updateQuery
        ).exec();
      }

      res.status(200).json({
        success: true,
        message: t('like_unlike_success'),
      });
    } else {
      const commentDoc = await Comment.findById(commentId).exec();
      if (!commentDoc) {
        res.status(404);
        throw new Error('comment_not_found');
      }

      const alreadyLiked = commentDoc.likedBy.some(
        (uid: any) => uid.toString() === userId
      );

      let updateQuery: any = {};
      if (action === LIKE.like && !alreadyLiked) {
        updateQuery = { $addToSet: { likedBy: userObjectId } };
      } else if (action === LIKE.unlike && alreadyLiked) {
        updateQuery = { $pull: { likedBy: userObjectId } };
      }

      if (Object.keys(updateQuery).length > 0) {
        await Comment.findByIdAndUpdate(commentId, updateQuery).exec();
      }

      res.status(200).json({
        success: true,
        message: t('like_unlike_success'),
      });
    }
  } catch (error: any) {
    throw error;
  }
});

async function fetchComments(
  userId: string,
  matchCondition: any,
  options: { skip?: number; limit?: number } = {}
) {
  const { skip, limit } = options;

  const pipeline: any[] = [
    { $match: matchCondition },
    { $sort: { createdAt: -1 } },
  ];

  if (typeof skip === 'number') pipeline.push({ $skip: skip });
  if (typeof limit === 'number') pipeline.push({ $limit: limit });

  pipeline.push(
    {
      $lookup: {
        from: 'users',
        localField: 'commentedBy',
        foreignField: '_id',
        as: 'commentedBy',
      },
    },
    { $unwind: '$commentedBy' },
    {
      $lookup: {
        from: 'users',
        localField: 'replies.repliedBy',
        foreignField: '_id',
        as: 'replyUsers',
      },
    },
    {
      $addFields: {
        isLiked: { $in: [new ObjectId(userId), '$likedBy'] },
        totalLikes: { $size: { $ifNull: ['$likedBy', []] } },
        replies: {
          $map: {
            input: { $ifNull: ['$replies', []] },
            as: 'reply',
            in: {
              id: '$$reply._id',
              content: '$$reply.content',
              createdAt: '$$reply.createdAt',
              isLiked: { $in: [new ObjectId(userId), '$$reply.likedBy'] },
              totalLikes: { $size: { $ifNull: ['$$reply.likedBy', []] } },
              repliedBy: {
                $let: {
                  vars: {
                    user: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$replyUsers',
                            as: 'u',
                            cond: { $eq: ['$$u._id', '$$reply.repliedBy'] },
                          },
                        },
                        0,
                      ],
                    },
                  },
                  in: {
                    id: '$$user._id',
                    name: '$$user.name',
                    profile: {
                      $cond: [
                        {
                          $or: [
                            { $eq: ['$$user.profile', null] },
                            { $eq: ['$$user.profile', ''] },
                            { $not: ['$$user.profile'] },
                          ],
                        },
                        '$$REMOVE',
                        {
                          $concat: [
                            config.host + '/profile/',
                            '$$user.profile',
                          ],
                        },
                      ],
                    },
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
        id: '$_id',
        reel: 1,
        content: 1,
        createdAt: 1,
        totalLikes: 1,
        isLiked: 1,
        replies: 1,
        commentedBy: {
          id: '$commentedBy._id',
          name: '$commentedBy.name',
          profile: {
            $cond: [
              {
                $or: [
                  { $eq: ['$commentedBy.profile', null] },
                  { $eq: ['$commentedBy.profile', ''] },
                  { $not: ['$commentedBy.profile'] },
                ],
              },
              '$$REMOVE',
              {
                $concat: [config.host + '/profile/', '$commentedBy.profile'],
              },
            ],
          },
        },
      },
    }
  );

  const results = await Comment.aggregate(pipeline).exec();
  return results;
}
