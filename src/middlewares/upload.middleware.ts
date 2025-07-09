import { unlinkSync, existsSync, mkdirSync } from 'fs';
import multer from 'multer';
import path from 'path';
import {
  imageMaxSize,
  PROFILE_FOLDER,
  REEL_FOLDER,
  CATEGORY_FOLDER,
  THUMBNAIL_FOLDER,
  videoMaxSize,
} from '../config/constants';

[PROFILE_FOLDER, REEL_FOLDER, CATEGORY_FOLDER, THUMBNAIL_FOLDER].forEach((dir) => {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
});

const getStorage = (destination: string) =>
  multer.diskStorage({
    destination: (_, __, cb) => cb(null, destination),
    filename: (_, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}${ext}`);
    },
  });

const getFileFilter =
  (allowedTypes: string[]) =>
  (_: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    if (allowedTypes.some((type) => file.mimetype.startsWith(`${type}/`))) {
      cb(null, true);
    } else {
      cb(new Error(`only_${allowedTypes.join('_or_')}_allowed`));
    }
  };

const createUploader = (
  folder: string,
  types: string[],
  maxSize: number
) =>
  multer({
    storage: getStorage(folder),
    fileFilter: getFileFilter(types),
    limits: { fileSize: maxSize },
  });

const uploaders = {
  profile: createUploader(PROFILE_FOLDER, ['image'], imageMaxSize),
  category: createUploader(CATEGORY_FOLDER, ['image'], imageMaxSize),
  reelVideo: createUploader(REEL_FOLDER, ['video'], videoMaxSize),
  thumbnail: createUploader(THUMBNAIL_FOLDER, ['image'], imageMaxSize),
};

const handleSingleFileUpload =
  (uploader: multer.Multer, field: string) =>
  (req: any, res: any, next: any) => {
    uploader.single(field)(req, res, (err) => {
      if (err && req.file?.path) unlinkSync(req.file.path);
      return err ? next(err) : next();
    });
  };

export const uploadProfile = handleSingleFileUpload(uploaders.profile, 'profile');
export const uploadCategory = handleSingleFileUpload(uploaders.category, 'image');

const cleanUpFiles = (files: any[]) =>
  (files || []).forEach((f) => {
    if (f?.path && existsSync(f.path)) {
      try {
        unlinkSync(f.path);
      } catch (err) {}
    }
  });

const validateMediaFiles = (files: any[]) => {
  if (!files?.length) return { valid: false, error: 'media_required' };

  const hasVideo = files.some((f) => f.mimetype.startsWith('video/'));
  const hasImage = files.some((f) => f.mimetype.startsWith('image/'));

  if (hasVideo && files.length > 1) {
    return { valid: false, error: 'multiple_files_with_video' };
  }
  if (hasVideo && hasImage) {
    return { valid: false, error: 'mix_video_image_files' };
  }

  return { valid: true };
};

export const uploadReel = (req: any, res: any, next: any) => {
  const upload = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        let dir = '';
        if (file.fieldname === 'media') {
          dir = REEL_FOLDER;
        } else if (file.fieldname === 'thumbnail') {
          dir = THUMBNAIL_FOLDER;
        } else {
          return cb(new Error(`Unexpected field: ${file.fieldname}`), '');
        }
      
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`),
    }),
    fileFilter: (req, file, cb) => {
      const { fieldname, mimetype } = file;
      if (
        (fieldname === 'media' && (mimetype.startsWith('video/') || mimetype.startsWith('image/'))) ||
        (fieldname === 'thumbnail' && mimetype.startsWith('image/'))
      ) {
        return cb(null, true);
      }
      cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', fieldname));
    },
    limits: { fileSize: videoMaxSize },
  }).fields([
    { name: 'media', maxCount: 10 },
    { name: 'thumbnail', maxCount: 1 },
  ]);

  upload(req, res, (err) => {
    const mediaFiles = Array.isArray(req.files?.media) ? req.files.media : [];
    const thumbnailFile = Array.isArray(req.files?.thumbnail) ? req.files.thumbnail[0] : null;

    if (err) {
      cleanUpFiles([...mediaFiles, thumbnailFile].filter(Boolean));
      throw new Error(err.message);
    }

    const validation = validateMediaFiles(mediaFiles);
    if (!validation.valid) {
      cleanUpFiles([...mediaFiles, thumbnailFile].filter(Boolean));
      throw new Error(validation.error);
    }

    if (!mediaFiles.length) {
      cleanUpFiles([thumbnailFile]);
      throw new Error('media_required');
    }

    const isVideo = mediaFiles[0].mimetype.startsWith('video/');
    if (isVideo && mediaFiles.length > 1) {
      cleanUpFiles([...mediaFiles, thumbnailFile].filter(Boolean));
      throw new Error('multiple_files_with_video');
    }

    req.mediaType = isVideo ? 'video' : 'image';
    if (thumbnailFile) req.thumbnailFile = thumbnailFile;

    next();
  });
};

export const handleFileUploadError = (err: any, req: any, res: any, next: any) => {
  if (err) {
    throw new Error(err.message);
  }
  next();
};
