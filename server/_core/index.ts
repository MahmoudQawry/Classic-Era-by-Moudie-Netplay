import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { registerNetplayServer } from "../netplay";
import { registerUniversalNetplayServer } from "../universal-netplay";
import { isAllowedOrigin } from "./cors";
import { securityHeaders, validateProductionEnvironment } from "./security";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  validateProductionEnvironment();

  const app = express();
  app.disable("x-powered-by");
  const server = createServer(app);

  app.use((req, res, next) => {
    securityHeaders(res);
    const origin = req.headers.origin;
    if (origin && !isAllowedOrigin(origin)) {
      res.sendStatus(403);
      return;
    }
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // The API does not accept file uploads. Emulator save states use the
  // separately bounded Socket.IO path, so HTTP requests can stay small.
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ limit: "256kb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerNetplayServer(server);
  registerUniversalNetplayServer(server);

  const relayRegion = process.env.REALTIME_REGION || "unknown";
  const relayRelease = process.env.REALTIME_RELEASE || "dev";

  app.get("/api/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, timestamp: Date.now(), region: relayRegion, release: relayRelease });
  });

  app.get("/api/realtime/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      service: "moudie-netplay-relay",
      region: relayRegion,
      release: relayRelease,
      timestamp: Date.now(),
      migrationAvailable: Boolean(process.env.REALTIME_MIGRATION_TARGET?.trim()),
    });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000", 10);
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  server.listen(port, () => console.log(`[api] server listening on port ${port} region=${relayRegion} release=${relayRelease}`));
}

startServer().catch((error) => {
  console.error("[api] failed to start:", error);
  process.exitCode = 1;
});
