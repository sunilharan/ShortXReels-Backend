import { Schema, model, PopulatedDoc, Document, ObjectId } from 'mongoose';
import { IRole } from './role.model';
import { ICategory } from './category.model';
import { GENDER_TYPE, STATUS_TYPE } from '../config/constants';
import bcrypt from 'bcryptjs';
import { config } from '../config/config';
import { IReel } from './reel.model';

export interface IUser extends Document {
  name: string;
  displayName: string;
  description: string;
  email: string;
  password: string;
  phone: string;
  gender: GENDER_TYPE;
  profile: string;
  birthDate: Date;
  status: STATUS_TYPE;
  role: PopulatedDoc<Document<ObjectId> & IRole>;
  token: string;
  notification: {
    social: boolean;
    subscription: boolean;
    recommendation: boolean;
  };
  interests: PopulatedDoc<Document<ObjectId> & ICategory>[];
  savedReels: PopulatedDoc<Document<ObjectId> & IReel>[];
  createdAt: Date;
  updatedAt: Date;
  matchPassword(enteredPassword: string): Promise<boolean>;
}

export const userSchema = new Schema<IUser>(
  {
    name: { type: String },
    displayName: { type: String },
    description: { type: String },
    email: { type: String },
    password: { type: String },
    phone: { type: String },
    gender: { type: String, enum: GENDER_TYPE, default: GENDER_TYPE.male },
    profile: { type: String },
    birthDate: { type: Date },
    status: { type: String, enum: STATUS_TYPE, default: STATUS_TYPE.active },
    role: { type: Schema.Types.ObjectId, ref: 'Role' },
    token: { type: String },
    notification: {
      social: { type: Boolean, default: true },
      subscription: { type: Boolean, default: true },
      recommendation: { type: Boolean, default: true },
    },
    interests: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
    savedReels: [{ type: Schema.Types.ObjectId, ref: 'Reel' }],
  },
  {
    timestamps: true,
    toJSON: {
      transform: function (doc, ret) {
        ret.id = ret._id;
        if (ret.profile) {
          if (!/^https?:\/\//i.test(ret.profile)) {
            ret.profile = `${config.host}/profile/${ret.profile}`;
          }
        }
        delete ret._id;
        delete ret.password;
        delete ret.token;
        delete ret.__v;
        delete ret.savedReels;
      },
    },
  }
);
userSchema.methods.matchPassword = async function (enteredPassword: string) {
  return await bcrypt.compare(enteredPassword, this.password);
};
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

userSchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate() as any;
  if (!update.password) return next();
  if (!/^\$2[aby]\$/.test(update.password)) {
    const salt = await bcrypt.genSalt(10);
    update.password = await bcrypt.hash(update.password, salt);
  }
  next();
});

export const User = model<IUser>('User', userSchema);
