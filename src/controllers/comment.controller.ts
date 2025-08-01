import expressAsyncHandler from 'express-async-handler';
import { Comment } from '../models/comment.model';
import mongoose from 'mongoose';
import { Reel } from '../models/reel.model';
import { COMMENT_TYPE, LIKE_TYPE } from '../config/enums';
import { t } from 'i18next';
import { config } from '../config/config';
import WebSocket from '../websocket/WebSocket';
import { STATUS_TYPE } from '../config/enums';

export const createComment = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { reelId: reel, content, commentId } = req.body;

    if (!reel) {
      res.status(400);
      throw new Error('invalid_request');
    }
    if (!content || content.trim() === '') {
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
        updatedBy: userId,
        updatedAt: new Date().toISOString(),
      };
      await Comment.findByIdAndUpdate(
        commentId,
        {
          $addToSet: { replies: reply },
          updatedBy: userId,
          updatedAt: new Date().toISOString(),
        },
        { new: true }
      ).exec();

      comment = await Comment.findById(commentId).exec();
      if (!comment) {
        res.status(400);
        throw new Error('comment_creation_failed');
      }
      const commentData = await fetchComments(userId, {
        _id: comment._id,
        status: STATUS_TYPE.active,
      });
      const totalComments = await countActiveCommentsWithActiveUsers({
        reel: new mongoose.Types.ObjectId(String(reel)),
        status: STATUS_TYPE.active,
      });
      const newReply =
        commentData[0].replies[commentData[0].replies.length - 1];
      const io = WebSocket.getInstance();
      io.of('reel').to(commentData[0].reel.toString()).emit('newComment', {
        type: COMMENT_TYPE.reply,
        reelId: reel,
        commentId: commentId,
        reply: newReply,
        totalComments: totalComments,
      });
    } else {
      comment = await Comment.create({
        commentedBy: userId,
        reel,
        content,
        updatedBy: userId,
      });
      if (!comment) {
        res.status(400);
        throw new Error('comment_creation_failed');
      }
      const commentData = await fetchComments(userId, {
        _id: comment._id,
        status: STATUS_TYPE.active,
      });
      const totalComments = await countActiveCommentsWithActiveUsers({
        reel: new mongoose.Types.ObjectId(String(reel)),
        status: STATUS_TYPE.active,
      });

      const io = WebSocket.getInstance();
      io.of('reel').to(reel.toString()).emit('newComment', {
        type: COMMENT_TYPE.comment,
        reelId: reel,
        comment: commentData[0],
        totalComments: totalComments,
      });
    }

    res.status(201).json({
      success: true,
      message: t('comment_created'),
    });
  } catch (error) {
    throw error;
  }
});

export const getCommentsByReel = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const reelId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    if (!reelId) {
      res.status(400);
      throw new Error('invalid_request');
    }
    const reelExists = await Reel.findById(reelId).exec();
    if (!reelExists) {
      res.status(404);
      throw new Error('reel_not_found');
    }

    const comments = await fetchComments(
      userId,
      {
        reel: new mongoose.Types.ObjectId(String(reelId)),
        status: STATUS_TYPE.active,
      },
      { skip, limit }
    );

    const total = await countActiveCommentsWithActiveUsers({
      reel: reelId,
      status: STATUS_TYPE.active,
    });
    res.status(200).json({
      success: true,
      data: {
        comments,
        totalRecords: total,
        totalComments: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    throw error;
  }
});

export const getById = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const commentId = req.params.id;

    if (!commentId) {
      res.status(400);
      throw new Error('invalid_request');
    }
    const comment = await Comment.findById(commentId)
      .populate(
        ['commentedBy', 'likedBy', 'replies.repliedBy', 'replies.likedBy'],
        'name profile'
      )
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
  } catch (error) {
    throw error;
  }
});

export const deleteComment = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const commentId = req.query.commentId;
    const replyId = req.query.replyId;

    if (!commentId) {
      res.status(400);
      throw new Error('invalid_request');
    }
    let comment;
    if (!replyId) {
      comment = await Comment.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(String(commentId)),
          commentedBy: new mongoose.Types.ObjectId(String(userId)),
        },
        {
          $set: {
            status: STATUS_TYPE.deleted,
            updatedBy: userId,
            updatedAt: new Date().toISOString(),
          },
        }
      );
    } else {
      comment = await Comment.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(String(commentId)),
          'replies._id': new mongoose.Types.ObjectId(String(replyId)),
          'replies.repliedBy': new mongoose.Types.ObjectId(String(userId)),
        },
        {
          $set: {
            'replies.$.status': STATUS_TYPE.deleted,
            'replies.$.updatedBy': userId,
            'replies.$.updatedAt': new Date().toISOString(),
          },
        }
      );
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
    const totalComments = await countActiveCommentsWithActiveUsers({
      reel: new mongoose.Types.ObjectId(String(reel?.id)),
      status: STATUS_TYPE.active,
    });
    const io = WebSocket.getInstance();

    io.of('reel')
      .to(reel.id.toString())
      .emit('commentDeleted', {
        type: replyId ? COMMENT_TYPE.reply : COMMENT_TYPE.comment,
        commentId,
        replyId: replyId || null,
        reelId: reel.id,
        totalComments,
      });

    res.status(200).json({
      success: true,
      data: totalComments,
      message: t('comment_deleted'),
    });
  } catch (error) {
    throw error;
  }
});

export const likeUnlikeComment = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { commentId, replyId, action } = req.body;

    if (!action || (action !== LIKE_TYPE.like && action !== LIKE_TYPE.unlike)) {
      res.status(400);
      throw new Error('invalid_action');
    }
    if (!commentId) {
      res.status(400);
      throw new Error('invalid_request');
    }

    const userObjectId = new mongoose.Types.ObjectId(String(userId));

    if (replyId) {
      const commentDoc = await Comment.findOne(
        { _id: commentId, 'replies._id': replyId },
        { 'replies.$': 1, reel: 1 }
      ).exec();

      if (!commentDoc || !commentDoc.replies?.length) {
        res.status(404);
        throw new Error('reply_not_found');
      }

      const reply = commentDoc.replies[0];
      const alreadyLiked = reply.likedBy.some(
        (id: any) => id.toString() === userId
      );

      let updateQuery: any = {};
      if (action === LIKE_TYPE.like && !alreadyLiked) {
        updateQuery = { $addToSet: { 'replies.$.likedBy': userObjectId } };
      } else if (action === LIKE_TYPE.unlike && alreadyLiked) {
        updateQuery = { $pull: { 'replies.$.likedBy': userObjectId } };
      }

      if (Object.keys(updateQuery).length > 0) {
        await Comment.findOneAndUpdate(
          { _id: commentId, 'replies._id': replyId },
          updateQuery
        ).exec();
      }

      const updatedDoc = await Comment.findOne(
        { _id: commentId, 'replies._id': replyId },
        { 'replies.$': 1, reel: 1 }
      ).exec();

      const updatedReply = updatedDoc?.replies?.[0];
      const isNowLiked = updatedReply?.likedBy?.some(
        (id: any) => id.toString() === userId
      );
      const totalLikes = updatedReply?.likedBy?.length || 0;

      const io = WebSocket.getInstance();
      io.of('reel')
        .to(updatedDoc?.reel?.toString() || 'reel')
        .emit('likeUnlikeComment', {
          type: COMMENT_TYPE.reply,
          commentId,
          replyId,
          userId,
          isLiked: isNowLiked,
          totalLikes,
        });

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
        (id: any) => id.toString() === userId
      );

      let updateQuery: any = {};
      if (action === LIKE_TYPE.like && !alreadyLiked) {
        updateQuery = { $addToSet: { likedBy: userObjectId } };
      } else if (action === LIKE_TYPE.unlike && alreadyLiked) {
        updateQuery = { $pull: { likedBy: userObjectId } };
      }

      if (Object.keys(updateQuery).length > 0) {
        await Comment.findByIdAndUpdate(commentId, updateQuery).exec();
      }

      const updatedComment = await Comment.findById(commentId).exec();
      const isNowLiked = updatedComment?.likedBy?.some(
        (id: any) => id.toString() === userId
      );
      const totalLikes = updatedComment?.likedBy?.length || 0;

      const io = WebSocket.getInstance();
      io.of('reel')
        .to(updatedComment?.reel?.toString() || 'reel')
        .emit('likeUnlikeComment', {
          type: COMMENT_TYPE.comment,
          commentId,
          replyId: null,
          userId,
          isLiked: isNowLiked,
          totalLikes,
        });

      res.status(200).json({
        success: true,
        message: t('like_unlike_success'),
      });
    }
  } catch (error) {
    throw error;
  }
});

export const statusChange = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.user.id;
    const { id, status, commentId } = req.body;
    if (
      !id ||
      !status ||
      ![STATUS_TYPE.active, STATUS_TYPE.inactive].includes(status)
    ) {
      throw new Error('invalid_request');
    }
    if (commentId) {
      const comment = await Comment.findById(commentId);
      if (!comment) throw new Error('comment_not_found');
      const reply = await Comment.findOneAndUpdate(
        {
          _id: new mongoose.Types.ObjectId(String(commentId)),
          'replies._id': new mongoose.Types.ObjectId(String(id)),
        },
        {
          $set: {
            'replies.$.status': status,
            'replies.$.updatedBy': userId,
            'replies.$.updatedAt': new Date().toISOString(),
          },
        }
      );
      if (!reply) throw new Error('reply_not_found');
    } else {
      const comment = await Comment.findById(id);
      if (!comment) throw new Error('comment_not_found');
      await Comment.findByIdAndUpdate(id, { status });
    }
    res.status(200).json({
      success: true,
      message: t('status_changed'),
    });
  } catch (error) {
    throw error;
  }
});

export const blockUnblockComment = expressAsyncHandler(
  async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id, isBlocked, commentId } = req.body;
      if (!id || typeof isBlocked !== 'boolean') {
        throw new Error('invalid_request');
      }
      if (commentId) {
        const comment = await Comment.findById(commentId);
        if (!comment) throw new Error('comment_not_found');
        if (Boolean(isBlocked) === true) {
          const reply = await Comment.findOneAndUpdate(
            {
              _id: new mongoose.Types.ObjectId(String(commentId)),
              'replies._id': new mongoose.Types.ObjectId(String(id)),
            },
            {
              $set: {
                'replies.$.status': STATUS_TYPE.blocked,
                'replies.$.updatedBy': userId,
                'replies.$.updatedAt': new Date().toISOString(),
              },
            }
          );
          if (!reply) throw new Error('reply_not_found');
        } else if (Boolean(isBlocked) === false) {
          const reply = await Comment.findOneAndUpdate(
            {
              _id: new mongoose.Types.ObjectId(String(commentId)),
              'replies._id': new mongoose.Types.ObjectId(String(id)),
            },
            {
              $set: {
                'replies.$.status': STATUS_TYPE.blocked,
                'replies.$.updatedBy': userId,
                'replies.$.updatedAt': new Date().toISOString(),
              },
            }
          );
          if (!reply) throw new Error('reply_not_found');
        }
      } else {
        const comment = await Comment.findById(id);
        if (!comment) throw new Error('comment_not_found');

        if (Boolean(isBlocked) === true) {
          if (comment.status === STATUS_TYPE.blocked) {
            throw new Error('data_already_blocked');
          }
          await Comment.findByIdAndUpdate(id, {
            status: STATUS_TYPE.blocked,
            updatedBy: userId,
            updatedAt: new Date().toISOString(),
          });
        } else if (Boolean(isBlocked) === false) {
          if (comment.status !== STATUS_TYPE.blocked) {
            throw new Error('data_not_blocked');
          }
          await Comment.findByIdAndUpdate(id, {
            status: STATUS_TYPE.active,
            updatedBy: userId,
            updatedAt: new Date().toISOString(),
          });
        }
      }
      res.status(200).json({
        success: true,
        message: t('data_blocked'),
      });
    } catch (error) {
      throw error;
    }
  }
);

export const fetchComments = async (
  userId: string,
  matchQuery: any,
  options: { skip?: number; limit?: number } = {}
) => {
  const { skip, limit } = options;

  const pipeline: any[] = [
    { $match: matchQuery },
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
      $match: {
        'commentedBy.status': STATUS_TYPE.active,
      },
    },
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
        isLiked: {
          $in: [new mongoose.Types.ObjectId(String(userId)), '$likedBy'],
        },
        totalLikes: { $size: { $ifNull: ['$likedBy', []] } },
        replies: {
          $map: {
            input: {
              $filter: {
                input: { $ifNull: ['$replies', []] },
                as: 'reply',
                cond: {
                  $and: [
                    { $eq: ['$$reply.status', STATUS_TYPE.active] },
                    {
                      $gt: [
                        {
                          $size: {
                            $filter: {
                              input: '$replyUsers',
                              as: 'u',
                              cond: {
                                $and: [
                                  { $eq: ['$$u._id', '$$reply.repliedBy'] },
                                  { $eq: ['$$u.status', STATUS_TYPE.active] },
                                ],
                              },
                            },
                          },
                        },
                        0,
                      ],
                    },
                  ],
                },
              },
            },
            as: 'reply',
            in: {
              id: '$$reply._id',
              content: '$$reply.content',
              createdAt: '$$reply.createdAt',
              isLiked: {
                $in: [
                  new mongoose.Types.ObjectId(String(userId)),
                  '$$reply.likedBy',
                ],
              },
              totalLikes: { $size: { $ifNull: ['$$reply.likedBy', []] } },
              status: '$$reply.status',
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
                      $cond: {
                        if: { $not: ['$$user.profile'] },
                        then: '$$REMOVE',
                        else: {
                          $concat: [
                            config.host + '/profile/',
                            '$$user.profile',
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
        status: 1,
        isLiked: 1,
        replies: 1,
        commentedBy: {
          id: '$commentedBy._id',
          name: '$commentedBy.name',
          profile: {
            $cond: {
              if: { $not: ['$commentedBy.profile'] },
              then: '$$REMOVE',
              else: {
                $concat: [config.host + '/profile/', '$commentedBy.profile'],
              },
            },
          },
        },
      },
    }
  );

  const results = await Comment.aggregate(pipeline).exec();
  return results;
};

export const countActiveCommentsWithActiveUsers = async (query: any) => {
  const result = await Comment.aggregate([
    { $match: query },
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
      $match: {
        'commentedBy.status': STATUS_TYPE.active,
      },
    },
    { $count: 'total' },
  ]).exec();
  return result[0]?.total || 0;
};
