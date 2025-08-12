import i18next from 'i18next';

export const notFound = (req: any, res: any, next: any) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

export const errorHandler = (err: any, req: any, res: any, next: any) => {
  const statusCode =
    Number(res.statusCode) === 200 ? 400 : Number(res.statusCode);

  const defaultErrorKey = 'internal_server_error';
  let translatedMessage: string;
  if (req.t && err.message && req.t(err.message, { defaultValue: '' })) {
    translatedMessage = req.t(err.message);
  } else {
    translatedMessage = req.t
      ? req.t(defaultErrorKey)
      : i18next.t(defaultErrorKey);
  }

  res.status(statusCode).json({
    success: false,
    message: translatedMessage,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : null,
  });
};
