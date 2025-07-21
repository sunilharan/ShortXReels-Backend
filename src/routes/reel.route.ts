import { Router } from 'express';
import { authenticate } from '../middlewares/auth.middleware';
import { uploadFiles } from '../middlewares/upload.middleware';
import {
  getReels,
  createReel,
  deleteReel,
  likeUnlikeReel,
  reelById,
  streamReelVideo,
  dashboardReels,
  getReelsByUser,
  viewReel,
} from '../controllers/reel.controller';
import { validateCreateReel } from '../middlewares/reel.middleware';

const router = Router();

router.use(authenticate);

router.get('/', getReels);
router.get('/getByUser', getReelsByUser);
router.get('/dashboardReels', dashboardReels);
router.get('/view/:id', streamReelVideo);
router.get('/:id', reelById);
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

export default router;
