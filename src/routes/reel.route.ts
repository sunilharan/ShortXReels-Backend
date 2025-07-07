import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { uploadReel } from "../middlewares/upload.middleware";
import { getReels, userReels, createReel, deleteReel, likeUnlikeReel, reelById ,editReel, streamReelVideo} from "../controllers/reel.controller";
import { validateCreateReel, validateUpdateReel } from "../middlewares/reel.middleware";

const router = Router();

router.get("/view/:id", streamReelVideo);
router.use(authenticate);

router.get("/", getReels);
router.get("/userReels", userReels);
router.get("/:id", reelById);
router.post("/",uploadReel,validateCreateReel, createReel);
router.delete("/:id", deleteReel);
router.put("/", uploadReel, validateUpdateReel, editReel);
router.post("/likeUnlike",likeUnlikeReel);


export default router;
