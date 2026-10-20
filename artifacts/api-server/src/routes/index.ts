import { Router, type IRouter } from "express";
import healthRouter from "./health";
import castingRouter from "./casting";
import downloadRouter from "./download";

const router: IRouter = Router();

router.use(healthRouter);
router.use(castingRouter);
router.use(downloadRouter);

export default router;
