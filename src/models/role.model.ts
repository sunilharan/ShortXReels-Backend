import { Schema, model, Document } from 'mongoose';
export interface IRole extends Document {
  name: string;
}
export const roleSchema = new Schema<IRole>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
  },
  {
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
      },
    },
  }
);
export const Role = model<IRole>('Role', roleSchema);
