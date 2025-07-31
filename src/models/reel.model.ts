import { Schema, model, Document, PopulatedDoc, ObjectId } from 'mongoose';
import { IUser } from './user.model';
import { ICategory } from './category.model';
import { MEDIA_TYPE, STATUS_TYPE } from '../config/enums';
import { config } from '../config/config';

export interface IReel extends Document {
  createdBy: PopulatedDoc<IUser & Document>;
  caption: string;
  thumbnail?: string;
  media?: string | string[];
  duration?: number;
  mediaType: MEDIA_TYPE;
  viewedBy: PopulatedDoc<IUser & Document>[];
  likedBy: PopulatedDoc<IUser & Document>[];
  categories: PopulatedDoc<ICategory & Document>[];
  status: STATUS_TYPE;
  isAdmin: boolean;
  updatedBy: PopulatedDoc<Document<ObjectId> & IUser>;
  createdAt: Date;
  updatedAt: Date;
}

const reelSchema = new Schema<IReel>(
  {
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    caption: { type: String, required: true },
    thumbnail: { type: String },
    media: Schema.Types.Mixed,
    mediaType: {
      type: String,
      enum: Object.values(MEDIA_TYPE),
      required: true,
    },
    duration: { type: Number },
    viewedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    likedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    categories: [
      { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    ],
    status: {
      type: String,
      enum: Object.values(STATUS_TYPE),
      default: STATUS_TYPE.active,
    },
    isAdmin: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.isAdmin;
        if (ret.media && ret.mediaType === MEDIA_TYPE.video) {
          ret.media = `${config.host}/api/reel/view/${ret.id}`;
        } else if (ret.mediaType === MEDIA_TYPE.image && ret.media.length > 0) {
          ret.media = ret.media.map((img: any) => `${config.host}/reel/${img}`);
        }
        if (ret?.thumbnail) {
          ret.thumbnail = `${config.host}/thumbnail/${ret.thumbnail}`;
        }
      },
    },
  }
);

export const Reel = model<IReel>('Reel', reelSchema);
