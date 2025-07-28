import i18next from "i18next";

export const notFound = (req: any, res: any, next: any) => {
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

export const errorHandler = (err: any, req: any, res: any, next: any) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  res.json({
    success: false,
    message: req.t ? req.t(err.message) : i18next.t("invalid_request"),
    stack: process.env.NODE_ENV !== 'production' ? err.stack : null,
  });
};
