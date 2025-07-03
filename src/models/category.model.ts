import { Schema, model, Document } from 'mongoose';
import { CATEGORY } from '../config/constants';
import { config } from '../config/config';

export interface ICategory extends Document {
  name: string;
  type: CATEGORY;
  image: string;
}

export const categorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: CATEGORY,
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

categorySchema.pre<ICategory>('save', function (next) {
  if (!this.isModified('name')) return next();
  this.name = this.name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s\-'",!@#$%^&*()]/g, '') 
    .replace(/\s+/g, '-');
  next();
});

export const Category = model<ICategory>('Category', categorySchema);
