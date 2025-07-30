import { Router } from "express";
import { adminOnly, authenticate } from "../middlewares/auth.middleware";
import { createComment, deleteComment, getCommentsByReel,getById,likeUnlikeComment, statusChange,blockUnblockComment } from "../controllers/comment.controller";

const router = Router();

router.use(authenticate);
router.get("/getByReel/:id", getCommentsByReel);
router.get("/:id", getById);
router.post("/", createComment);
router.delete("/", deleteComment);
router.post("/likeUnlike", likeUnlikeComment);
router.use(adminOnly);
router.post("/status", statusChange);
router.post("/blockUnblock", blockUnblockComment);

export default router;
