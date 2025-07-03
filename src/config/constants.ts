import { existsSync, unlinkSync } from 'fs';
import { config } from './config';

export const UserRole = {
  SuperAdmin: 'super_admin',
  Admin: 'admin',
  User: 'user',
};
export const ROLES = [UserRole.SuperAdmin, UserRole.Admin, UserRole.User];

export const UPLOAD_FOLDER = process.cwd() + '/uploads';
export const PROFILE_FOLDER = UPLOAD_FOLDER + '/profiles';
export const REEL_VIDEO_FOLDER = UPLOAD_FOLDER + '/reels';
export const CATEGORY_FOLDER = UPLOAD_FOLDER + '/categories';

export const FOLDER_LIST = [
  UPLOAD_FOLDER,
  PROFILE_FOLDER,
  REEL_VIDEO_FOLDER,
  CATEGORY_FOLDER,
];

export const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/;
export const passwordRegex =
  /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?\d)(?=.*?[#?!@$%^&*-]).{8,}$/;
export const imageMaxSize = 10 * 1024 * 1024;
export const videoMaxSize = 100 * 1024 * 1024;
export enum STATUS {
  active = 'active',
  inactive = 'inactive',
  deleted = 'deleted',
}

export enum GENDER {
  male = 'Male',
  female = 'Female',
  other = 'Other',
}

export enum CATEGORY {
  movie = 'Movie',
  genre = 'Genre',
}

export enum REASON {
  spam = 'Spam or repetitive content',
  fraud = 'Scam or fraudulent content',
  harassment = 'Harassment or bullying',
  misleading_information = 'Misleading title or thumbnail',
  harmful_content = 'Harmful or dangerous acts',
  age_restriction_violation = 'Age-restricted content shown without warning',
  nudity = 'Nudity (unrated or inappropriate)',
  sexual_activity = 'Sexual activity (unrated or inappropriate)',
  violence = 'Excessive violence (unrated or inappropriate)',
  hate_speech = 'Hate speech or abusive language',
  incorrect_movie_info = 'Incorrect movie information',
  fake_scene = 'Fake or AI-generated scene',
  out_of_context = 'Out-of-context movie clip',
  spoiler = 'Spoiler without warning',
  copyright = 'Copyright infringement',
  pirated_content = 'Pirated or leaked content',
  irrelevant = 'Irrelevant or not movie-related',
  poor_quality = 'Low quality or broken video',
  offensive_subtitles = 'Offensive captions or subtitles',
  other = 'Other',
}
export const Reasons = Object.values(REASON);

export const categories = [
  'action',
  'adventure',
  'animation',
  'comedy',
  'crime',
  'documentary',
  'drama',
  'family',
  'fantasy',
  'history',
  'horror',
  'music',
  'mystery',
  'romance',
  'science fiction',
  'thriller',
  'war',
];

export const DEFAULT_SUPER_ADMIN = {
  email: 'superadmin@gmail.com',
  password: 'Admin12@',
  name: 'superadmin',
  role: UserRole.SuperAdmin,
  status: STATUS.active,
  gender: GENDER.male,
  birthDate: new Date('1990-01-01'),
};

export const removeFile = async (filePath: string, folderName: string) => {
  try {
    if (!filePath) return;
    let fileName = filePath;
    if (filePath.startsWith('http')) {
      const url = new URL(filePath);
      const pathParts = url.pathname.split('/');
      fileName = pathParts[pathParts.length - 1];
    }
    const fullPath = `${process.cwd()}/${folderName}/${fileName}`;
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  } catch (error) {
    throw error;
  }
};
