import { Schema, model, PopulatedDoc, Document, ObjectId } from 'mongoose';
import { IUser } from './user.model';
import { config } from '../config/config';
import { addSeconds } from 'date-fns';

export interface IOtp extends Document {
  userId: PopulatedDoc<Document<ObjectId> & IUser>;
  otp: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const otpSchema = new Schema<IOtp>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    otp: { type: String },
    expiresAt: {
      type: Date,
      default: () => addSeconds(new Date(), parseInt(config.otpExpire)),
    },
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

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Otp = model<IOtp>('Otp', otpSchema);
