import { Schema, model, Document, PopulatedDoc, ObjectId } from 'mongoose';
import { IUser } from './user.model';
import { IReel } from './reel.model';
import { STATUS_TYPE } from '../config/enums';

export interface IReply extends Document {
  repliedBy: PopulatedDoc<Document<ObjectId> & IUser>;
  content: string;
  likedBy: PopulatedDoc<Document<ObjectId> & IUser>[];
  status: STATUS_TYPE;
  updatedBy: PopulatedDoc<Document<ObjectId> & IUser>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IComment extends Document {
  reel: PopulatedDoc<Document<ObjectId> & IReel>;
  commentedBy: PopulatedDoc<Document<ObjectId> & IUser>;
  content: string;
  likedBy: PopulatedDoc<Document<ObjectId> & IUser>[];
  replies: IReply[];
  status: STATUS_TYPE;
  updatedBy: PopulatedDoc<Document<ObjectId> & IUser>;
  createdAt: Date;
  updatedAt: Date;
}

export const commentSchema = new Schema<IComment>(
  {
    reel: { type: Schema.Types.ObjectId, ref: 'Reel', required: true },
    commentedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    likedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: { type: String, enum: STATUS_TYPE, default: STATUS_TYPE.active },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    replies: [
      {
        repliedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        content: { type: String },
        likedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        status: {
          type: String,
          enum: STATUS_TYPE,
          default: STATUS_TYPE.active,
        },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
        updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
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
