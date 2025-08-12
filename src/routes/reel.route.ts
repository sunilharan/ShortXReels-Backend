import { Router } from 'express';
import { adminOnly, authenticate } from '../middlewares/auth.middleware';
import { uploadFiles } from '../middlewares/upload.middleware';
import {
  getReels,
  createReel,
  deleteReel,
  likeUnlikeReel,
  userReels,
  adminReels,
  streamReelVideo,
  dashboardReels,
  getReelsByUser,
  viewReel,
  statusChange,
  blockUnblockReel,
  topReels,
  reelsYearMonthChart,
} from '../controllers/reel.controller';
import { validateCreateReel } from '../middlewares/reel.middleware';
import { blockedReelsContent } from '../controllers/report.controller';

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
router.post('/blockUnblock', blockUnblockReel);
router.post('/status', statusChange);
router.get('/userReels', userReels);
router.get('/adminReels', adminReels);
router.get('/topReels', topReels);
router.get('/reelsChart', reelsYearMonthChart);
router.get('/blockedReels', blockedReelsContent);

export default router;
