import expressAsyncHandler from 'express-async-handler';
import i18next from 'i18next';

export const notFound = expressAsyncHandler((req: any, res: any) => {
  try {
    res.status(404);
    throw new Error(`Not Found - ${req.originalUrl}`);
  } catch (error) {
    throw error;
  }
});

export const errorHandler = (err: any, req: any, res: any, _: any): void => {
  const statusCode =
    Number(res.statusCode) === 200 ? 500 : Number(res.statusCode);

  const defaultErrorKey = 'internal_server_error';
  let translatedMessage: string;

  if (req.t && err.message && req.t(err.message, { defaultValue: '' })) {
    translatedMessage = req.t(err.message);
  } else {
    translatedMessage = req.t
      ? req.t(defaultErrorKey)
      : i18next.t(defaultErrorKey);
  }
  const obj: any = {
    success: false,
    message: translatedMessage,
  };
  if (process.env.NODE_ENV !== 'production') {
    obj.stack = err.stack;
  }
  res.status(statusCode).json(obj);
};
