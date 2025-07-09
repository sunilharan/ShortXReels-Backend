import expressAsyncHandler from 'express-async-handler';
import { Comment } from '../models/comments.model';
import { ObjectId } from 'mongodb';
import { Reel } from '../models/reel.model';
import { UserRole } from '../config/constants';
import { t } from 'i18next';

export const createComment = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const { reelId: reel, content } = req.body;

    if (!reel || !ObjectId.isValid(reel)) {
      res.status(400);
      throw new Error('invalid_reel_id');
    }
    if (!content || typeof content !== 'string' || content.trim() === '') {
      res.status(400);
      throw new Error('comment_content_required');
    }
    const reelExists = await Reel.findById(reel).exec();
    if (!reelExists) {
      res.status(404);
      throw new Error('reel_not_found');
    }
    const comment = await Comment.create({
      commentedBy: userId,
      reel,
      content,
    });

    if (!comment) {
      res.status(400);
      throw new Error('comment_creation_failed');
    }

    res.status(201).json({
      success: true,
      data: comment,
    });
  } catch (error: any) {
    console.error(error);
    res.status(400);
    throw new Error(error.message);
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
    const comments = await Comment.find({ reel: reelId })
      .populate('commentedBy', 'name profile')
      .populate('likedBy', 'name profile')
      .populate('replies.repliedBy', 'name profile')
      .populate('replies.likedBy', 'name profile')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
    const total = await Comment.countDocuments({ reel: reelId });
    res.status(200).json({
      success: true,
      data: {
        comments,
        totalRecords: total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    console.error(error);
    res.status(400);
    throw new Error(error.message);
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
    console.error(error);
    res.status(400);
    throw new Error(error.message);
  }
});

export const deleteComment = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const commentId = req.params.id;

    if (!commentId || !ObjectId.isValid(commentId)) {
      res.status(400);
      throw new Error('invalid_comment_id');
    }
    let comment;
    if (req.role === UserRole.SuperAdmin || req.role === UserRole.Admin) {
      comment = await Comment.findByIdAndDelete(commentId);
    } else {
      comment = await Comment.findOneAndDelete({
        _id: new ObjectId(commentId),
        commentedBy: new ObjectId(userId),
      });
    }
    if (!comment) {
      res.status(404);
      throw new Error('comment_not_found');
    }
    res.status(200).json({
      success: true,
      message: t('comment_deleted'),
    });
  } catch (error: any) {
    console.error(error);
    res.status(400);
    throw new Error(error.message);
  }
});
export const editComment = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const { commentId, content } = req.body;

    if (!commentId || !ObjectId.isValid(commentId)) {
      res.status(400);
      throw new Error('invalid_comment_id');
    }
    let comment;
    if (!content || typeof content !== 'string' || content.trim() === '') {
      res.status(400);
      throw new Error('invalid_comment_content');
    }
    if (req.role === UserRole.SuperAdmin || req.role === UserRole.Admin) {
      comment = await Comment.findByIdAndUpdate(
        commentId,
        { content },
        { new: true }
      );
    } else {
      comment = await Comment.findOneAndUpdate(
        {
          _id: new ObjectId(commentId),
          commentedBy: new ObjectId(userId),
        },
        { content },
        { new: true }
      );
    }
    if (!comment) {
      res.status(404);
      throw new Error('comment_not_found');
    }
    res.status(200).json({
      success: true,
      data: comment,
    });
  } catch (error: any) {
    console.error(error);
    res.status(400);
    throw new Error(error.message);
  }
});

export const updateComment = expressAsyncHandler(async (req: any, res) => {
  try {
    const userId = req.userId;
    const { commentId, action, content, replyId } = req.body;
    if (!action || !['like', 'unlike', 'edit', 'create'].includes(action)) {
      throw new Error('invalid_action');
    }
    if (!commentId || !ObjectId.isValid(commentId)) {
      throw new Error('invalid_comment_id');
    }

    const commentDoc = await Comment.findById(commentId).exec();
    if (!commentDoc) {
      throw new Error('comment_not_found');
    }

    const updateOps: any = {};
    const userObjectId = new ObjectId(userId);

    if ((action === 'like' || action === 'unlike') && !replyId) {
      const alreadyLiked = commentDoc.likedBy.some(
        (uid: any) => uid.toString() === userId
      );

      if (action === 'like' && !alreadyLiked) {
        updateOps.$addToSet = {
          ...(updateOps.$addToSet || {}),
          likedBy: userObjectId,
        };
      } else if (action === 'unlike' && alreadyLiked) {
        updateOps.$pull = {
          ...(updateOps.$pull || {}),
          likedBy: userObjectId,
        };
      }
    }

    if ((action === 'like' || action === 'unlike') && replyId) {
      const replyIndex = commentDoc.replies.findIndex(
        (reply: any) => reply.id === replyId
      );
      if (replyIndex === -1) {
        throw new Error('reply_not_found');
      }

      const reply = commentDoc.replies[replyIndex];
      const alreadyLiked = reply.likedBy.some(
        (uid: any) => uid.toString() === userId
      );

      if (action === 'like' && !alreadyLiked) {
        reply.likedBy.push(userObjectId);
        reply.updatedAt = new Date();
      } else if (action === 'unlike' && alreadyLiked) {
        reply.likedBy = reply.likedBy.filter(
          (uid: any) => uid.toString() !== userId
        );
        reply.updatedAt = new Date();
      }

      updateOps.$set = { replies: commentDoc.replies };
    }

    if (action === 'edit' && content) {
      if (typeof content !== 'string' || content.trim() === '') {
        throw new Error('invalid_content');
      }
      updateOps.$set = { content, updatedAt: new Date() };
    }
    if (content && action === 'create') {
      if (typeof content !== 'string' || content.trim() === '') {
        throw new Error('invalid_content');
      }

      const reply = {
        repliedBy: userObjectId,
        content,
        likedBy: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      updateOps.$addToSet = { ...(updateOps.$addToSet || {}), replies: reply };
    }
    if (
      replyId &&
      content &&
      action === 'edit' &&
      typeof content === 'string'
    ) {
      const replyIndex = commentDoc.replies.findIndex(
        (reply: any) => reply.id === replyId
      );
      if (replyIndex === -1) {
        throw new Error('reply_not_found');
      }

      commentDoc.replies[replyIndex].content = content;
      commentDoc.replies[replyIndex].updatedAt = new Date();
      updateOps.$set = { replies: commentDoc.replies };
    }
    let updatedComment;
    if (Object.keys(updateOps).length > 0) {
      updatedComment = await Comment.findByIdAndUpdate(commentId, updateOps, {
        new: true,
      }).exec();
    } else {
      updatedComment = commentDoc;
    }

    res.status(200).json({
      success: true,
      data: updatedComment,
    });
  } catch (error: any) {
    console.error(error);
    throw new Error(error.message);
  }
});
