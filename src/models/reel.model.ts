import { Schema, model, Document, PopulatedDoc } from 'mongoose';
import { IUser } from './user.model';
import { ICategory } from './category.model';
import { MEDIA, STATUS } from '../config/constants';
import { config } from '../config/config';

export interface IReel extends Document {
  createdBy: PopulatedDoc<IUser & Document>;
  caption: string;
  thumbnail?: string;
  media?: any;
  mediaType: MEDIA;
  views: number;
  likedBy: PopulatedDoc<IUser & Document>[];
  categories: PopulatedDoc<ICategory & Document>[];
  status: STATUS;
  createdAt: Date;
  updatedAt: Date;
}

const reelSchema = new Schema<IReel>(
  {
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    caption: { type: String, required: true },
    thumbnail: { type: String },
    media: Schema.Types.Mixed,
    mediaType: { type: String, enum: Object.values(MEDIA), required: true },
    views: { type: Number, default: 0 },
    likedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    categories: [
      { type: Schema.Types.ObjectId, ref: 'Category', required: true },
    ],
    status: {
      type: String,
      enum: Object.values(STATUS),
      default: STATUS.active,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        if (ret?.media) {
          if (ret.mediaType === MEDIA.video) {
            ret.media.url = `${config.host}/api/reel/view/${ret.id}`;
          } else if (ret.mediaType === MEDIA.image) {
            ret.media = ret.media.map(
              (img: any) => `${config.host}/reel/${img}`
            );
          }
        }
        if (ret?.thumbnail) {
          ret.thumbnail = `${config.host}/reel/${ret.thumbnail}`;
        }
      },
    },
  }
);

export const Reel = model<IReel>('Reel', reelSchema);
