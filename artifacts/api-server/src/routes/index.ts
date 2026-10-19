import { Router, type IRouter } from "express";
import healthRouter from "./health";
import castingRouter from "./casting";

const router: IRouter = Router();

router.use(healthRouter);
router.use(castingRouter);

export default router;
