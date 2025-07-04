import mongoose from 'mongoose';
import { Role } from '../models/role.model';
import { Categories, ROLES } from '../config/constants';
import { config } from '../config/config';
import { Category } from '../models/category.model';
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
    .catch((err) => {
      console.log('error', err);
    });
  Category.estimatedDocumentCount()
    .then((count) => {
      if (count === 0) {
        Categories.forEach((category) => {
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
