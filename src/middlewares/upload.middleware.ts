import { unlinkSync, existsSync, mkdirSync } from 'fs';
import multer from 'multer';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { imageMaxSize, PROFILE_FOLDER, REEL_VIDEO_FOLDER, CATEGORY_FOLDER } from '../config/constants';

[PROFILE_FOLDER, REEL_VIDEO_FOLDER, CATEGORY_FOLDER].forEach(dir => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

const getStorage = (destination: string) => {
  return multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, destination);
    },
    filename: function (req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      const baseName = path.basename(file.originalname, ext);
      const uniqueSuffix = Date.now() + '-' + baseName;
      cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    },
  });
};

const imageFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('only_image_allowed'));
  }
};

const videoFileFilter = (
  req: Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('only_video_allowed'));
  }
};

const uploadProfile = multer({
  storage: getStorage(PROFILE_FOLDER),
  fileFilter: imageFileFilter,
  limits: { fileSize: imageMaxSize },
});

const uploadCategoryImage = multer({
  storage: getStorage(CATEGORY_FOLDER),
  fileFilter: imageFileFilter,
  limits: { fileSize: imageMaxSize },
});

const uploadVideo = multer({
  storage: getStorage(REEL_VIDEO_FOLDER),
  fileFilter: videoFileFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
});

export const uploadProfilePicture = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  uploadProfile.single('profile')(req, res, (err: any) => {
    if (err) {
      if (req.file) {
        unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }
    next();
  });
};
export const uploadCategoryImageFile = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  uploadCategoryImage.single('image')(req, res, (err: any) => {
    if (err) {
      if (req.file) {
        unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }
    next();
  });
};

export const uploadReelVideo = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  uploadVideo.single('video')(req, res, (err: any) => {
    if (err) {
      if (req.file) {
        unlinkSync(req.file.path);
      }
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }
    next();
  });
};

export const handleFileUploadError = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
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
