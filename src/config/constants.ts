import { existsSync, unlinkSync } from 'fs';

export const UserRole = {
  SuperAdmin: 'super_admin',
  Admin: 'admin',
  User: 'user',
};
export const ROLES = [UserRole.SuperAdmin, UserRole.Admin, UserRole.User];

export const UPLOAD_FOLDER = process.cwd() + '/uploads';
export const PROFILE_FOLDER = UPLOAD_FOLDER + '/profiles';
export const REEL_FOLDER = UPLOAD_FOLDER + '/reels';
export const CATEGORY_FOLDER = UPLOAD_FOLDER + '/categories';
export const THUMBNAIL_FOLDER = UPLOAD_FOLDER + '/thumbnails';

export const FOLDER_LIST = [
  UPLOAD_FOLDER,
  PROFILE_FOLDER,
  REEL_FOLDER,
  CATEGORY_FOLDER,
  THUMBNAIL_FOLDER,
];

export const emailRegex = /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/;
export const passwordRegex =
  /^(?=.*?[A-Z])(?=.*?[a-z])(?=.*?\d)(?=.*?[#?!@$%^&*-]).{8,}$/;
export const imageMaxSize = 10 * 1024 * 1024;
export const videoMaxSize = 100 * 1024 * 1024;

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
export const Categories = [
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
export enum STATUS {
  active = 'active',
  inactive = 'inactive',
  deleted = 'deleted',
}

export enum GENDER {
  male = 'male',
  female = 'female',
  other = 'other',
}
export enum MEDIA {
  image = 'image',
  video = 'video',
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

export const DEFAULT_SUPER_ADMIN = {
  email: 'superadmin@gmail.com',
  password: 'Admin12@',
  name: 'superadmin',
  role: UserRole.SuperAdmin,
  status: STATUS.active,
  gender: GENDER.male,
  birthDate: new Date('1990-01-01'),
};

export const removeFile = async (filePath: string | undefined | null, folderName: string) => {
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
    return
  }
};
