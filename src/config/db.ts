import mongoose from 'mongoose';
import { Role } from '../models/role.model';
import { CATEGORIES, ROLES } from '../config/constants';
import { config } from '../config/config';
import { Category } from '../models/category.model';

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
    const roleCount = await Role.estimatedDocumentCount().exec();
    if (roleCount === 0) {
      await Promise.all(ROLES.map((role) => Role.create({ name: role })));
    }

    const categoryCount = await Category.estimatedDocumentCount().exec();
    if (categoryCount === 0) {
      await Promise.all(
        CATEGORIES.map((category) =>
          Category.create({
            name: category,
            image: `${category}.jpg`,
          })
        )
      );
    }
  } catch (err) {
    console.error('Error in createInitial:', err);
  }
};
