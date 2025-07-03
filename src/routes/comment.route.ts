import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { createComment, deleteComment, getCommentsByReel, updateComment,editComment,getById } from "../controllers/comment.controller";

const router = Router();

router.use(authenticate);
router.get("/getByReel/:id", getCommentsByReel);
router.get("/:id", getById);
router.post("/", createComment);
router.delete("/:id", deleteComment);
router.put("/", editComment);
router.put("/update", updateComment);

export default router;
