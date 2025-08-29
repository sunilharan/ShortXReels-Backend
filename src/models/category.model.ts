import { Schema, model, Document, PopulatedDoc, ObjectId } from 'mongoose';
import { config } from '../config/config';
import { STATUS_TYPE } from '../config/enums';
import { IUser } from './user.model';

export interface ICategory extends Document {
  name: string;
  status: STATUS_TYPE;
  image: string;
  createdBy: PopulatedDoc<Document<ObjectId> & IUser>;
  updatedBy: PopulatedDoc<Document<ObjectId> & IUser>;
  createdAt: Date;
  updatedAt: Date;
}

export const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(STATUS_TYPE),
      default: STATUS_TYPE.active,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User',},
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_, ret: Record<string, any>) => {
        ret.id = ret._id;
        if (ret.image) {
          ret.image = `${config.host}/category/${ret.image}`;
        }
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);

export const Category = model<ICategory>('Category', categorySchema);
