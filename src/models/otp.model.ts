import { Schema, model, PopulatedDoc, Document } from 'mongoose';
import { IUser } from './user.model';
import { ObjectId } from 'mongodb';
import moment from 'moment';
import { config } from '../config/config';

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
      default: () => moment().add(parseInt(config.otpExpire || '180'), 'seconds').toDate()
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

// Create TTL index on expiresAt field
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });


export const Otp = model<IOtp>('Otp', otpSchema);
