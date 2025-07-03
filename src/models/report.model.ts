import { Schema, model, Document, PopulatedDoc, ObjectId } from 'mongoose';
import { IUser } from './user.model';
import { IReel } from './reel.model';
import { REASON, STATUS } from '../config/constants';

export interface IReport extends Document {
  reel: PopulatedDoc<Document<ObjectId> & IReel>;
  reportedBy: PopulatedDoc<Document<ObjectId> & IUser>;
  reason: REASON;
  description: string;
  status: STATUS;
  reviewBy: PopulatedDoc<Document<ObjectId> & IUser>;
  reviewResultValid: boolean;
  reviewDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const reportSchema = new Schema<IReport>(
  {
    reel: { type: Schema.Types.ObjectId, ref: 'Reel' },
    reportedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, enum: REASON },
    description: { type: String },
    status: { type: String, enum: STATUS, default: STATUS.active },
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
