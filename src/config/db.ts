import mongoose from 'mongoose';
import { Role } from '../models/role.model';
import {
  CATEGORIES,
  DEFAULT_SUPER_ADMIN,
  ROLES,
  UserRole,
} from '../config/constants';
import { STATUS_TYPE, GENDER_TYPE } from '../config/enums';
import { config } from '../config/config';
import { Category } from '../models/category.model';
import { User } from '../models/user.model';

export const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.databaseUrl);
    console.log('MongoDB connected: ', conn.connection.host);
    createInitial();
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const createInitial = async () => {
  Role.estimatedDocumentCount()
    .then((count) => {
      if (count === 0) {
        ROLES.forEach((role) => {
          Role.create({
            name: role,
          }).catch();
        });
      }
    })
    .then(async () => {
      const user = await User.findOne({
        email: DEFAULT_SUPER_ADMIN.email,
      }).catch((err) => {
        console.log('error', err);
      });
      if (!user) {
        const role = await Role.findOne({ name: UserRole.SuperAdmin }).exec();
        if (!role) {
          return;
        }
        User.create({
          name: DEFAULT_SUPER_ADMIN.name,
          email: DEFAULT_SUPER_ADMIN.email,
          password: DEFAULT_SUPER_ADMIN.password,
          displayName: DEFAULT_SUPER_ADMIN.displayName,
          role: role?.id,
          status: STATUS_TYPE.active,
          gender: GENDER_TYPE.male,
          birthDate: new Date('1990-01-01'),
        }).catch();
      }
    })
    .catch((err) => {
      console.log('error', err);
    });
    
  Category.estimatedDocumentCount()
    .then((count) => {
      if (count === 0) {
        CATEGORIES.forEach((category) => {
          Category.create({
            name: category,
            image: `${category}.jpg`,
          }).catch();
        });
      }
    })
    .catch((err) => {
      console.log('error', err);
    });
};
