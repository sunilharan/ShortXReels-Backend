import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { createComment, deleteComment, getCommentsByReel,getById,likeUnlikeComment } from "../controllers/comment.controller";

const router = Router();

router.use(authenticate);
router.get("/getByReel/:id", getCommentsByReel);
router.get("/:id", getById);
router.post("/", createComment);
router.delete("/", deleteComment);
router.post("/likeUnlike", likeUnlikeComment);

export default router;
