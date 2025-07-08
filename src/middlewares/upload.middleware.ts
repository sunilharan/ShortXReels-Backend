import { unlinkSync, existsSync, mkdirSync } from 'fs';
import multer from 'multer';
import path from 'path';
import {
  imageMaxSize,
  PROFILE_FOLDER,
  REEL_FOLDER,
  CATEGORY_FOLDER,
} from '../config/constants';

[PROFILE_FOLDER, REEL_FOLDER, CATEGORY_FOLDER].forEach((dir) => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

const getStorage = (destination: string) =>
  multer.diskStorage({
    destination: (_, __, cb) => cb(null, destination),
    filename: (_, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const baseName = path.basename(file.originalname, ext);
      const uniqueSuffix = `${Date.now()}-${baseName}`;
      cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
    },
  });

const getFileFilter =
  (type: 'image' | 'video') =>
  (_: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (file.mimetype.startsWith(`${type}/`)) {
      cb(null, true);
    } else {
      cb(new Error(`only_${type}_allowed`));
    }
  };

const getUploader = (
  destination: string,
  type: 'image' | 'video',
  maxSize: number
) =>
  multer({
    storage: getStorage(destination),
    fileFilter: getFileFilter(type),
    limits: { fileSize: maxSize },
  });

const uploaders = {
  profile: getUploader(PROFILE_FOLDER, 'image', imageMaxSize),
  category: getUploader(CATEGORY_FOLDER, 'image', imageMaxSize),
  reelVideo: getUploader(REEL_FOLDER, 'video', 100 * 1024 * 1024),
};

const handleSingleFileUpload =
  (uploader: multer.Multer, fieldName: string) =>
  (req: any, res: any, next: any) => {
    uploader.single(fieldName)(req, res, (err: any) => {
      if (err) {
        if (req.file && req.file.path) {
          unlinkSync(req.file.path);
        }
        return next(err);
      }
      next();
    });
  };

export const uploadProfile = handleSingleFileUpload(
  uploaders.profile,
  'profile'
);

export const uploadCategory = handleSingleFileUpload(
  uploaders.category,
  'image'
);

const reelUploader = multer({
  storage: getStorage(REEL_FOLDER),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (
    _: any,
    file: Express.Multer.File,
    cb: multer.FileFilterCallback
  ) => {
    if (
      file.mimetype.startsWith('video/') ||
      file.mimetype.startsWith('image/')
    ) {
      cb(null, true);
    } else {
      cb(new Error('only_image_or_video_allowed'));
    }
  },
});

export const uploadReel = (req: any, res: any, next: any) => {
  reelUploader.fields([
    { name: 'media', maxCount: 10 },
    { name: 'thumbnail', maxCount: 1 },
  ])(req, res, (err: any) => {
    if (err instanceof multer.MulterError || err) {
      (req.files?.media || []).forEach((f: any) => f.path && unlinkSync(f.path));
      (req.files?.thumbnail || []).forEach((f: any) => f.path && unlinkSync(f.path));
      return res.status(400).json({
        success: false,
        error: err.message || 'File upload failed',
      });
    }
    next();
  });
};

export const handleFileUploadError = (
  err: any,
  req: any,
  res: any,
  next: any
) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: err.message,
    });
  } else if (err) {
    return res.status(500).json({
      success: false,
      error: 'Error uploading file',
    });
  }
  next();
};
