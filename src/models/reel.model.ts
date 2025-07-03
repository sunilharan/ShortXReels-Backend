import { Schema, model, Document, PopulatedDoc, ObjectId } from 'mongoose';
import { IUser } from './user.model';
import { ICategory } from './category.model';
import { STATUS } from '../config/constants';
import { config } from '../config/config';
export interface IReel extends Document {
  createdBy: PopulatedDoc<Document<ObjectId> & IUser>;
  caption: string;
  video: string;
  duration: number;
  size: number;
  views: number;
  likedBy: PopulatedDoc<Document<ObjectId> & IUser>[];
  categories: PopulatedDoc<Document<ObjectId> & ICategory>[];
  status: STATUS;
  createdAt: Date;
  updatedAt: Date;
}

export const reelSchema = new Schema<IReel>(
  {
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    caption: { type: String },
    video: { type: String },
    duration: { type: Number },
    size: { type: Number },
    views: { type: Number, default: 0 },
    likedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    categories: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    status: { type: String, enum: STATUS, default: STATUS.active },
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        if (ret.video) {
          ret.video = `${config.host}/api/reel/view/${ret.id}`;
        }
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);



export const Reel = model<IReel>('Reel', reelSchema);
