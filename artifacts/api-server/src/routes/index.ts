import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import adminUsersRouter from "./admin-users";
import auditLogsRouter from "./audit-logs";
import stationRouter from "./station";
import recordsRouter from "./records";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(adminUsersRouter);
router.use(auditLogsRouter);
router.use(stationRouter);
router.use(recordsRouter);

export default router;
