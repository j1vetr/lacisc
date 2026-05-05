import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import stationRouter from "./station";
import recordsRouter from "./records";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(stationRouter);
router.use(recordsRouter);

export default router;
