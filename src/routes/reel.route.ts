import { Router } from "express";
import { authenticate } from "../middlewares/auth.middleware";
import { uploadReel } from "../middlewares/upload.middleware";
import { getReels, createReel, deleteReel, likeUnlikeReel, reelById , streamReelVideo, dashboardReels, getReelsByUser} from "../controllers/reel.controller";
import { validateCreateReel } from "../middlewares/reel.middleware";

const router = Router();

router.get("/view/:id", streamReelVideo);
router.use(authenticate);

router.get("/", getReels);
router.get("/getByUser", getReelsByUser);
router.get("/dashboardReels", dashboardReels);
router.get("/:id", reelById);
router.post("/",uploadReel,validateCreateReel, createReel);
router.delete("/:id", deleteReel);
router.post("/likeUnlike",likeUnlikeReel);


export default router;
