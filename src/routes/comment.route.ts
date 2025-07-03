import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { createComment, deleteComment, getCommentsByReel, updateComment,editComment } from "../controllers/comment.controller";

const router = Router();

router.use(authenticate);
router.get("/getByReel/:id", getCommentsByReel);
router.post("/create", createComment);
router.delete("/delete/:id", deleteComment);
router.patch("/edit", editComment);
router.patch("/update", updateComment);

export default router;
