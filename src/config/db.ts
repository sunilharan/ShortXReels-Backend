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
    await createInitial();
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const createInitial = async () => {
  try {
    const roleCount = await Role.estimatedDocumentCount();
    if (roleCount === 0) {
      for (const role of ROLES) {
        try {
          await Role.create({ name: role });
        } catch (err) {
          console.error(`Failed to create role '${role}':`, err);
        }
      }
    }

    let user: any = null;
    try {
      user = await User.findOne({ email: DEFAULT_SUPER_ADMIN.email });
    } catch (err) {
      console.error('Error finding super admin user:', err);
    }

    if (!user) {
      const role = await Role.findOne({ name: UserRole.SuperAdmin }).exec();
      if (!role) {
        console.error('SuperAdmin role not found');
        return;
      }

      try {
        user = await User.create({
          name: DEFAULT_SUPER_ADMIN.name,
          email: DEFAULT_SUPER_ADMIN.email,
          password: DEFAULT_SUPER_ADMIN.password,
          displayName: DEFAULT_SUPER_ADMIN.displayName,
          role: role.id,
          status: STATUS_TYPE.active,
          gender: GENDER_TYPE.male,
          birthDate: new Date('1990-01-01'),
        });
      } catch (err) {
        console.error('Error creating super admin user:', err);
      }
    }

    const categoryCount = await Category.estimatedDocumentCount();
    if (categoryCount === 0) {
      for (const category of CATEGORIES) {
        try {
          await Category.create({
            name: category,
            image: `${category}.jpg`,
            createdBy: user?.id,
            updatedBy: user?.id,
          });
        } catch (err) {
          console.error(`Failed to create category '${category}':`, err);
        }
      }
    }
  } catch (err) {
    console.error('Error in createInitial:', err);
  }
};
