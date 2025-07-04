import { Schema, model, Document, PopulatedDoc, ObjectId } from 'mongoose';
import { IUser } from './user.model';
import { IReel } from './reel.model';

export interface IReply extends Document {
  repliedBy: PopulatedDoc<Document<ObjectId> & IUser>;
  content: string;
  likedBy: PopulatedDoc<Document<ObjectId> & IUser>[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IComment extends Document {
  reel: PopulatedDoc<Document<ObjectId> & IReel>;
  commentedBy: PopulatedDoc<Document<ObjectId> & IUser>;
  content: string;
  likedBy: PopulatedDoc<Document<ObjectId> & IUser>[];
  replies: IReply[];
  createdAt: Date;
  updatedAt: Date;
}

export const commentSchema = new Schema<IComment>(
  {
    reel: { type: Schema.Types.ObjectId, ref: 'Reel', required: true },
    commentedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    likedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    replies: [
      {
        repliedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        content: { type: String },
        likedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        createdAt: { type: Date },
        updatedAt: { type: Date },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        if (ret.replies.length > 0) {
          ret.replies.forEach((reply: any) => {
            reply.id = reply._id;
            delete reply._id;
            delete reply.__v;
          });
        }
      },
    },
  }
);

export const Comment = model<IComment>('Comment', commentSchema);
