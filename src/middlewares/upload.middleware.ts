import { randomUUID } from 'crypto';
import multer from 'multer';
import path from 'path';
import { unlinkSync, existsSync, mkdirSync } from 'fs';
import {
  UPLOAD_FOLDER,
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
    cb(null, `${randomUUID()}${ext}`);
  },
});


const createUploader = (types: string[]) => {
  return multer({
    storage,
    fileFilter: (_req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
      if (!types.some((type) => file.mimetype.startsWith(`${type}/`))) {
        cb(new Error(`only_${types.join('_or_')}_allowed`));
      } else {
        cb(null, true);
      }
    },
  });
};

export const uploadProfile = createUploader(['image']).single('profile');
export const uploadCategory = createUploader(['image']).single('image');
export const uploadReel = createUploader(['video', 'image']).fields([
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
    } catch (_) {}
  });
};
