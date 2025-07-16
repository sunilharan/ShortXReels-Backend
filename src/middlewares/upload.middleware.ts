import { unlinkSync, existsSync, mkdirSync, renameSync } from 'fs';
import multer from 'multer';
import path from 'path';
import {
  imageMaxSize,
  UPLOAD_FOLDER,
  videoMaxSize,
  FOLDER_LIST,
} from '../config/constants';

FOLDER_LIST.forEach((dir) => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_FOLDER);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  },
});

const getFileFilter =
  (allowedTypes: string[]) =>
  (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowedTypes.some((type) => file.mimetype.startsWith(`${type}/`))) {
      cb(null, true);
    } else {
      cb(new Error(`only_${allowedTypes.join('_or_')}_allowed`));
    }
  };

const createUploader = (types: string[], maxSize: number) =>
  multer({
    storage,
    fileFilter: getFileFilter(types),
    limits: { fileSize: maxSize },
  });

const uploaders = {
  profile: createUploader(['image'], imageMaxSize),
  category: createUploader(['image'], imageMaxSize),
  reelMedia: createUploader(['video', 'image'], videoMaxSize),
  thumbnail: createUploader(['image'], imageMaxSize),
};

export const uploadProfile = uploaders.profile.single('profile');
export const uploadCategory = uploaders.category.single('image');

export const uploadReel = uploaders.reelMedia.fields([
  { name: 'media', maxCount: 10 },
  { name: 'thumbnail', maxCount: 1 },
]);

export const cleanupUploadedFiles = (req: any) => {
  const filePaths: string[] = [];

  if (req.file) {
    filePaths.push(req.file.path);
  }

  if (req.files) {
    if (Array.isArray(req.files)) {
      req.files.forEach((file: any) => filePaths.push(file.path));
    } else if (typeof req.files === 'object') {
      Object.values(req.files).forEach((fileArray: any) => {
        (Array.isArray(fileArray) ? fileArray : [fileArray]).forEach(
          (file: any) => {
            if (file?.path) filePaths.push(file.path);
          }
        );
      });
    }
  }

  filePaths.forEach((filePath) => {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
      }
    } catch (err) {
      console.error(`Failed to delete file: ${filePath}`, err);
    }
  });
};
