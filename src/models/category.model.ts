import { Schema, model, Document } from 'mongoose';
import { config } from '../config/config';
import { STATUS_TYPE } from '../config/enums';

export interface ICategory extends Document {
  name: string;
  status: STATUS_TYPE;
  image: string;
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
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
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
