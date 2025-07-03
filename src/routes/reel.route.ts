import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { uploadReelVideo } from "../middlewares/upload.middleware";
import { feedTypeReels, userReels, createReel, deleteReel, likeUnlikeReel, reelById ,editReel, streamReelVideo} from "../controllers/reel.controller";
import { validateCreateReel, validateUpdateReel } from "../middlewares/reel.middleware";

const router = Router();

router.get("/view/:id", streamReelVideo);
router.use(authenticate);

router.get("/getByFeedType", feedTypeReels);
router.get("/userReels", userReels);
router.get("/:id", reelById);
router.post("/",uploadReelVideo,validateCreateReel, createReel);
router.delete("/:id", deleteReel);
router.put("/", uploadReelVideo, validateUpdateReel, editReel);
router.post("/likeUnlike",likeUnlikeReel);


export default router;
