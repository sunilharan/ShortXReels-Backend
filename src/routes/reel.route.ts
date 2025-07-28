import { Router } from 'express';
import { adminOnly, authenticate } from '../middlewares/auth.middleware';
import { uploadFiles } from '../middlewares/upload.middleware';
import {
  getReels,
  createReel,
  deleteReel,
  likeUnlikeReel,
  allReels,
  streamReelVideo,
  dashboardReels,
  getReelsByUser,
  viewReel,
  statusChange,
  blockReel,
} from '../controllers/reel.controller';
import { validateCreateReel } from '../middlewares/reel.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getReels);
router.get('/getByUser', getReelsByUser);
router.get('/dashboardReels', dashboardReels);
router.get('/view/:id', streamReelVideo);
router.post(
  '/',
  uploadFiles({
    media: { types: ['video', 'image'], maxCount: 10 },
    thumbnail: { types: ['image'], maxCount: 1 },
  }),
  validateCreateReel,
  createReel
);
router.delete('/:id', deleteReel);
router.post('/likeUnlike', likeUnlikeReel);
router.post('/view/:id', viewReel);
router.use(adminOnly);
router.post('/block', blockReel);
router.post('/status', statusChange);
router.get('/all', allReels);

export default router;
