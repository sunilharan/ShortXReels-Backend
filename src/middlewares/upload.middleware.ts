import { randomUUID } from 'crypto';
import busboy from 'busboy';
import path from 'path';
import {
  existsSync,
  mkdirSync,
  createWriteStream,
  unlinkSync,
  WriteStream,
  statSync,
} from 'fs';
import ffmpeg from 'fluent-ffmpeg';
import {
  UPLOAD_FOLDER,
  FOLDER_LIST,
  imageMaxSize,
} from '../config/constants';
import { MEDIA_TYPE } from '../config/enums';
import { Request, Response, NextFunction } from 'express';
import { t } from 'i18next';

FOLDER_LIST.forEach((dir) => {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
});

interface FileInfo {
  filename: string;
  encoding: string;
  mimeType: string;
}

interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimeType: string;
  size: number;
  path: string;
  filename: string;
}

declare global {
  namespace Express {
    interface Request {
      files?: Record<string, UploadedFile[]>;
      body: Record<string, any>;
    }
  }
}

interface AllowedFields {
  [field: string]: {
    maxCount: number;
    types: string[];
  };
}

const generateThumbnail = (videoPath: string, thumbnailPath: string) => {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(videoPath)
      .on('end', () => resolve())
      .on('error', reject)
      .screenshots({
        count: 1,
        folder: path.dirname(thumbnailPath),
        filename: path.basename(thumbnailPath),
      });
  });
};

export const uploadFiles = (allowedFields: AllowedFields) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const contentType = req.headers['content-type'] || '';
    if (
      !contentType.startsWith('multipart/form-data') ||
      !contentType.includes('boundary=')
    ) {
      req.files = {};
      req.body = {};
      return next();
    }

    const bb = busboy({ headers: req.headers });
    const files: Record<string, UploadedFile[]> = {};
    const body: Record<string, any> = {};
    let errored = false;
    let pending = 0;

    const fail = (err: Error | string, statusCode: number = 400) => {
      if (!errored) {
        errored = true;
        const message = t(String(err || 'invalid_request'));
        res.status(statusCode).json({ success: false, message });
      }
    };

    bb.on('field', (name, val) => {
      body[name] = val;
    });

    bb.on('file', (field, stream, info: FileInfo) => {
      if (
        field === 'thumbnail' &&
        req.baseUrl === '/api/reel' &&
        body.mediaType === MEDIA_TYPE.video
      ) {
        stream.resume();
        return;
      }

      if (errored) {
        return stream.resume();
      }

      if (req.baseUrl === '/api/reel') {
        const mediaType = body.mediaType || req.body.mediaType;

        if (
          !mediaType ||
          ![MEDIA_TYPE.image, MEDIA_TYPE.video].includes(mediaType)
        ) {
          stream.resume();
          return fail('invalid_media_type');
        }

        const rule = allowedFields[field];
        if (!rule) {
          stream.resume();
          return fail(`only_${field}_allowed`);
        }

        const mime = info.mimeType;
        const cleanTypes = rule.types.map((t) => t.replace(/^"|"$/g, ''));

        if (
          field === 'media' &&
          mediaType === MEDIA_TYPE.image &&
          !mime.startsWith('image/')
        ) {
          stream.resume();
          return fail(`only_${MEDIA_TYPE.image}_allowed`);
        }
        if (
          field === 'media' &&
          mediaType === MEDIA_TYPE.video &&
          !mime.startsWith('video/')
        ) {
          stream.resume();
          return fail(`only_${MEDIA_TYPE.video}_allowed`);
        }

        if (
          mediaType === MEDIA_TYPE.video &&
          files[field] &&
          files[field].length > 0
        ) {
          stream.resume();
          return fail(`invalid_${field}_format`);
        }

        const MAX_SIZE =
          mediaType === MEDIA_TYPE.image ? imageMaxSize : Infinity;
        if (!cleanTypes.some((t) => mime.startsWith(t + '/'))) {
          stream.resume();
          return fail(`invalid_${field}_format`);
        }

        const id = `${randomUUID()}${path.extname(info.filename)}`;
        const savePath = path.join(UPLOAD_FOLDER, id);

        let size = 0;
        pending++;
        const out: WriteStream = createWriteStream(savePath);

        stream.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_SIZE) {
            stream.destroy();
            out.destroy();
            try {
              unlinkSync(savePath);
            } catch {}
            pending--;
            return fail(`${mediaType}_max_size_exceeded`, 413);
          }
        });

        stream.pipe(out);

        out.on('close', async () => {
          if (errored) return;
          if (!files[field]) files[field] = [];

          const uploadedFile: UploadedFile = {
            fieldname: field,
            originalname: info.filename,
            encoding: info.encoding,
            mimeType: mime,
            size,
            path: savePath,
            filename: id,
          };

          files[field].push(uploadedFile);
          if (mediaType === MEDIA_TYPE.video) {
            try {
              const thumbnailFileName = `${path.parse(id).name}.jpg`;
              const thumbnailPath = path.join(UPLOAD_FOLDER, thumbnailFileName);

              await generateThumbnail(savePath, thumbnailPath);

              const thumbStats = statSync(thumbnailPath);

              files['thumbnail'] = [
                {
                  fieldname: 'thumbnail',
                  originalname: thumbnailFileName,
                  encoding: '7bit',
                  mimeType: 'image/jpeg',
                  size: thumbStats.size,
                  path: thumbnailPath,
                  filename: thumbnailFileName,
                },
              ];
            } catch (err) {
              console.error('Thumbnail generation failed:', err);
            }
          }

          pending--;
          if (pending === 0 && !errored) {
            req.files = files;
            req.body = { ...req.body, ...body };
            next();
          }
        });

        const handleError = (err: Error) => {
          if (errored) return;
          stream.destroy();
          out.destroy();
          try {
            unlinkSync(savePath);
          } catch {}
          pending--;
          fail(err);
        };

        stream.on('error', handleError);
        out.on('error', handleError);
      } else {
        const rule = allowedFields[field];
        if (!rule) {
          stream.resume();
          return fail(`only_${field}_allowed`);
        }

        const mime = info.mimeType || 'application/octet-stream';
        
        if (rule.types.some(t => t === MEDIA_TYPE.image) && !mime.startsWith('image/')) {
          stream.resume();
          return fail(`invalid_image_format`);
        }

        const MAX_FILE_SIZE = imageMaxSize;
        const id = `${randomUUID()}${path.extname(info.filename)}`;
        const savePath = path.join(UPLOAD_FOLDER, id);

        let size = 0;
        pending++;
        const out: WriteStream = createWriteStream(savePath);

        stream.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_FILE_SIZE) {
            stream.destroy();
            out.destroy();
            try {
              unlinkSync(savePath);
            } catch {}
            pending--;
            return fail('image_max_size_exceeded');
          }
        });

        stream.pipe(out);

        out.on('close', () => {
          if (errored) return;
          if (!files[field]) files[field] = [];

          files[field].push({
            fieldname: field,
            originalname: info.filename,
            encoding: info.encoding,
            mimeType: mime,
            size,
            path: savePath,
            filename: id,
          });

          pending--;

          if (pending === 0 && !errored) {
            req.files = files;
            req.body = { ...req.body, ...body };
            next();
          }
        });

        const handleError = (err: Error) => {
          if (errored) return;
          stream.destroy();
          out.destroy();
          try {
            unlinkSync(savePath);
          } catch {}
          pending--;
          fail(err);
        };

        stream.on('error', handleError);
        out.on('error', handleError);
      }
    });

    bb.on('finish', () => {
      if (pending === 0 && !errored) {
        if (req.baseUrl === '/api/reel' && Object.keys(files).length === 0) {
          return fail('no_files_uploaded');
        }
        req.files = files;
        req.body = { ...req.body, ...body };
        next();
      }
    });

    req.pipe(bb);

    req.on('error', (err) => {
      if (!errored) {
        errored = true;
        fail(err);
      }
    });
  };
};
