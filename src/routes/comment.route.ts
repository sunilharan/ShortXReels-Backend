import { Router } from 'express';
import { adminOnly, authenticate } from '../middlewares/auth.middleware';
import {
  createComment,
  deleteComment,
  getCommentsByReel,
  likeUnlikeComment,
  statusChange,
  blockUnblockComment,
} from '../controllers/comment.controller';
import { blockedCommentContent } from '../controllers/report.controller';

const router = Router();

router.use(authenticate);
router.get('/getByReel/:id', getCommentsByReel);
router.post('/', createComment);
router.delete('/', deleteComment);
router.post('/likeUnlike', likeUnlikeComment);
router.use(adminOnly);
router.post('/status', statusChange);
router.post('/blockUnblock', blockUnblockComment);
router.get('/blockedComments', blockedCommentContent);
export default router;
