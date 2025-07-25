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
import adminRouter from './routes/admin.route';
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
import { FOLDER_LIST } from './config/constants';
import { existsSync, mkdirSync } from 'fs';
import { createServer } from 'http';
import WebSocket from './websocket/WebSocket';
import ReelSocket from './websocket/ReelSocket';
connectDB();

FOLDER_LIST.forEach((folder) => {
  if (!existsSync(folder)) {
    mkdirSync(folder, { recursive: true });
  }
});
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

app.use('/api/user', userRouter);
app.use('/api/category', categoryRouter);
app.use('/api/reel', reelRouter);
app.use('/api/comment', commentRouter);
app.use('/api/report', reportRouter);
app.use('/api/admin', adminRouter);
app.use('/api/encrypt', getEncodeData);
app.use('/api/decrypt', getDecodedData);
app.get('/api/roles', adminOnly, getRoles);
app.get('/api/health', checkHealth);
setupSwaggerDocs(app);

app.use('/profile', express.static('files/profiles'));
app.use('/category', express.static('files/categories'));
app.use('/reel', express.static('files/reels'));
app.use('/thumbnail', express.static('files/thumbnails'));

app.use(notFound);
app.use(errorHandler);

const httpServer = createServer(app);
const SOCKET_PORT: any = config.socketPort || 5001;
httpServer.listen(SOCKET_PORT, () =>
  console.log(`Socket server is running on port ${SOCKET_PORT}.`)
);

const io = WebSocket.getInstance(httpServer);
io.initializeHandlers([
  { path: '/reel', handler: new ReelSocket() },
]);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
