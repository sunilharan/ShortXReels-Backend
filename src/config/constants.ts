import { existsSync, unlinkSync } from 'fs';

export const UserRole = {
  SuperAdmin: 'super_admin',
  Admin: 'admin',
  User: 'user',
};
export const ROLES = [UserRole.SuperAdmin, UserRole.Admin, UserRole.User];

export const FILE_FOLDER = process.cwd() + '/files';
export const UPLOAD_FOLDER = process.cwd() + '/uploads';
export const PROFILE_FOLDER = FILE_FOLDER + '/profiles';
export const REEL_FOLDER = FILE_FOLDER + '/reels';
export const CATEGORY_FOLDER = FILE_FOLDER + '/categories';
export const THUMBNAIL_FOLDER = FILE_FOLDER + '/thumbnails';
export const FOLDER_LIST = [
  FILE_FOLDER,
  UPLOAD_FOLDER,
  PROFILE_FOLDER,
  REEL_FOLDER,
  CATEGORY_FOLDER,
  THUMBNAIL_FOLDER,
];

export const nameRegex = /^[A-Za-z0-9._\-@#]{2,24}$/;
export const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/;
export const passwordRegex =
  /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?\d)(?=.*?[#?!@$%^&*-]).{8,}$/;
export const imageMaxSize = 50 * 1024 * 1024;

export const CategoriesType = {
  music: 'Music',
  gaming: 'Gaming',
  sports: 'Sports',
  movies: 'Movies',
  travel: 'Travel',
  food: 'Food',
  beauty: 'Beauty',
  health: 'Health',
  fitness: 'Fitness',
  education: 'Education',
  entertainment: 'Entertainment',
};
export const CATEGORIES = [
  CategoriesType.music,
  CategoriesType.gaming,
  CategoriesType.sports,
  CategoriesType.movies,
  CategoriesType.travel,
  CategoriesType.food,
  CategoriesType.beauty,
  CategoriesType.health,
  CategoriesType.fitness,
  CategoriesType.education,
  CategoriesType.entertainment,
];

export const removeFile = async (
  filePath: string | undefined | null,
  folderName: string
) => {
  try {
    if (!filePath || typeof filePath !== 'string') {
      return;
    }

    let fileName = filePath.trim();
    if (fileName.startsWith('http')) {
      const url = new URL(fileName);
      const pathParts = url.pathname.split('/');
      fileName = pathParts[pathParts.length - 1];
    }
    fileName = fileName.replace(/^["\[\]]+|["\[\]]+$/g, '');
    if (!fileName) {
      return;
    }
    const fullPath = `${process.cwd()}/${folderName}/${fileName}`;
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  } catch (error) {
    return;
  }
};
