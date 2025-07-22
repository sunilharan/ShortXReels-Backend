import { Schema, model, Document, PopulatedDoc, ObjectId } from 'mongoose';
import { IUser } from './user.model';
import { IReel } from './reel.model';
import {  REPORT_TYPE, STATUS_TYPE } from '../config/enums';
import { IComment, IReply } from './comments.model';

export interface IReport extends Document {
  reel: PopulatedDoc<Document<ObjectId> & IReel>;
  comment: PopulatedDoc<Document<ObjectId> & IComment>;
  reply: PopulatedDoc<Document<ObjectId> & IReply>;
  reportedBy: PopulatedDoc<Document<ObjectId> & IUser>;
  reason: string;
  reportType: REPORT_TYPE;
  status: STATUS_TYPE;
  reviewBy: PopulatedDoc<Document<ObjectId> & IUser>;
  reviewResultValid: boolean;
  reviewDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const reportSchema = new Schema<IReport>(
  {
    reel: { type: Schema.Types.ObjectId, ref: 'Reel' },
    comment: { type: Schema.Types.ObjectId, ref: 'Comment' },
    reply: { type: Schema.Types.ObjectId, ref: 'Reply' },
    reportedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String },
    reportType: { type: String, enum: REPORT_TYPE },
    status: { type: String, enum: STATUS_TYPE, default: STATUS_TYPE.active },
    reviewBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewResultValid: { type: Boolean, default: false },
    reviewDate: { type: Date },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

export const Report = model<IReport>('Report', reportSchema);
