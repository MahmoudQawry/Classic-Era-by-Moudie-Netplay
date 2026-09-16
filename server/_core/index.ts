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
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !isAllowedOrigin(origin)) {
      res.sendStatus(403);
      return;
    }
    if (origin) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  registerNetplayServer(server);
  registerUniversalNetplayServer(server);

  const relayRegion = process.env.REALTIME_REGION || "unknown";
  const relayRelease = process.env.REALTIME_RELEASE || "dev";
  const migrationTarget = (process.env.REALTIME_MIGRATION_TARGET || "").replace(/\/$/, "");

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, timestamp: Date.now(), region: relayRegion, release: relayRelease });
  });

  // Health-check and migration metadata for the global realtime load balancer.
  // The migration target is intentionally opt-in; an empty value never causes
  // clients to jump to an untrusted endpoint.
  app.get("/api/realtime/health", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      ok: true,
      service: "moudie-netplay-relay",
      region: relayRegion,
      release: relayRelease,
      timestamp: Date.now(),
      migrationAvailable: Boolean(migrationTarget),
      migrationTarget: migrationTarget || undefined,
    });
  });

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  server.listen(port, () => console.log(`[api] server listening on port ${port} region=${relayRegion} release=${relayRelease}`));
}

startServer().catch(console.error);
