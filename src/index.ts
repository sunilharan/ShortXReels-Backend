import express from 'express';
import cors from 'cors';
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import i18nextMiddleware from 'i18next-http-middleware';
import { connectDB } from './config/db';
import userRouter from './routes/user.route';
import categoryRouter from './routes/category.route';
import reelRouter from './routes/reel.route';
import commentRouter from './routes/comment.route';
import reportRouter from './routes/report.route';
import { config } from './config/config';
import { errorHandler, notFound } from './middlewares/error.middleware';
import setupSwaggerDocs from './docs/swagger';
import {
  getDecodedData,
  getEncodeData,
  getRoles,
  checkHealth,
} from './controllers/common.controller';
import { adminOnly } from './middlewares/auth.middleware';
connectDB();

const app = express();
const port = config.port;

app.use(
  cors({
    origin: '*',
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

i18next
  .use(Backend)
  .use(i18nextMiddleware.LanguageDetector)
  .init(
    {
      fallbackLng: config.defaultLanguage,
      preload: ['en', 'hi', 'gu'],
      backend: {
        loadPath: __dirname + '/locales/{{lng}}/translation.json',
      },
      debug: false,
    },
    (err, t) => {
      if (err) console.log(err);
    }
  );
app.use(i18nextMiddleware.handle(i18next));
app.use((req, res, next) => {
  i18next.changeLanguage(req.headers['accept-language']);
  next();
});
app.use('/api/user', userRouter);
app.use('/api/category', categoryRouter);
app.use('/api/reel', reelRouter);
app.use('/api/comment', commentRouter);
app.use('/api/report', reportRouter);
app.use('/api/encrypt', getEncodeData);
app.use('/api/decrypt', getDecodedData);
app.get('/api/roles', adminOnly, getRoles);
app.get('/api/health', checkHealth);
setupSwaggerDocs(app);

app.use('/profile', express.static('uploads/profiles'));
app.use('/category', express.static('uploads/categories'));
app.use('/reel', express.static('uploads/reels'));
app.use(notFound);
app.use(errorHandler);
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
