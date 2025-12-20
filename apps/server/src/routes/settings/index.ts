/**
 * Settings routes - HTTP API for persistent file-based settings
 */

import { Router } from "express";
import type { SettingsService } from "../../services/settings-service.js";
import { createGetGlobalHandler } from "./routes/get-global.js";
import { createUpdateGlobalHandler } from "./routes/update-global.js";
import { createGetCredentialsHandler } from "./routes/get-credentials.js";
import { createUpdateCredentialsHandler } from "./routes/update-credentials.js";
import { createGetProjectHandler } from "./routes/get-project.js";
import { createUpdateProjectHandler } from "./routes/update-project.js";
import { createMigrateHandler } from "./routes/migrate.js";
import { createStatusHandler } from "./routes/status.js";

export function createSettingsRoutes(settingsService: SettingsService): Router {
  const router = Router();

  // Status endpoint (check if migration needed)
  router.get("/status", createStatusHandler(settingsService));

  // Global settings
  router.get("/global", createGetGlobalHandler(settingsService));
  router.put("/global", createUpdateGlobalHandler(settingsService));

  // Credentials (separate for security)
  router.get("/credentials", createGetCredentialsHandler(settingsService));
  router.put("/credentials", createUpdateCredentialsHandler(settingsService));

  // Project settings
  router.post("/project", createGetProjectHandler(settingsService));
  router.put("/project", createUpdateProjectHandler(settingsService));

  // Migration from localStorage
  router.post("/migrate", createMigrateHandler(settingsService));

  return router;
}
