import { Router, type IRouter } from "express";
import healthRouter from "./health";
import metricsRouter from "./metrics";
import authRouter from "./auth";
import adminUsersRouter from "./admin-users";
import auditLogsRouter from "./audit-logs";
import stationRouter from "./station";
import recordsRouter from "./records";
import starlinkRouter from "./starlink";
import leobridgeRouter from "./leobridge";
import whatsappRouter from "./whatsapp";
import clientErrorsRouter from "./client-errors";

const router: IRouter = Router();

router.use(healthRouter);
router.use(metricsRouter);
router.use(authRouter);
router.use(adminUsersRouter);
router.use(auditLogsRouter);
router.use(stationRouter);
router.use(recordsRouter);
router.use(starlinkRouter);
router.use(leobridgeRouter);
router.use(whatsappRouter);
router.use(clientErrorsRouter);

export default router;
