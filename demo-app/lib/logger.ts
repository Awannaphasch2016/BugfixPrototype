import pino from "pino";
import path from "path";

const dest =
  process.env.LOG_FILE ?? path.join(process.cwd(), "logs", "app.log");

export const logger = pino(
  {
    level: process.env.LOG_LEVEL ?? "info",
    enabled: process.env.NODE_ENV !== "test",
  },
  pino.destination({ dest, sync: true, mkdir: true })
);

export function requestLogger(method: string, route: string) {
  return logger.child({
    reqId: Math.random().toString(36).slice(2, 10),
    method,
    route,
  });
}
