import { Router, type IRouter } from "express";
import rateLimit from "express-rate-limit";
import { optionalAuth, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

// Tarayıcıdan ErrorBoundary tarafından gönderilen hata raporlarını sunucu
// log'una yazar. Kimlik doğrulaması zorunlu değil (boundary anonim sayfalarda
// da çalışabilir), ama varsa userId log'a iliştirilir. DB'ye yazılmaz —
// pino çıktısı arşivleme/alerting için yeterlidir.
const clientErrorLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

interface ClientErrorBody {
  message?: string;
  stack?: string;
  componentStack?: string;
  url?: string;
  userAgent?: string;
}

router.post(
  "/client-errors",
  clientErrorLimiter,
  optionalAuth,
  async (req: AuthRequest, res): Promise<void> => {
    const body = (req.body ?? {}) as ClientErrorBody;
    req.log.error(
      {
        clientError: true,
        userId: req.userId ?? null,
        userEmail: req.userEmail ?? null,
        url: typeof body.url === "string" ? body.url.slice(0, 500) : null,
        userAgent: req.headers["user-agent"] ?? null,
        message: typeof body.message === "string" ? body.message.slice(0, 1000) : null,
        stack: typeof body.stack === "string" ? body.stack.slice(0, 4000) : null,
        componentStack:
          typeof body.componentStack === "string"
            ? body.componentStack.slice(0, 4000)
            : null,
      },
      "Client-side error reported"
    );
    res.json({ ok: true });
  }
);

export default router;
