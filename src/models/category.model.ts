import { Schema, model, Document } from 'mongoose';
import { config } from '../config/config';

export interface ICategory extends Document {
  name: string;
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
