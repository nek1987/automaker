/**
 * POST /api/settings/migrate - Migrate settings from localStorage
 */

import type { Request, Response } from "express";
import type { SettingsService } from "../../../services/settings-service.js";
import { getErrorMessage, logError, logger } from "../common.js";

export function createMigrateHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { data } = req.body as {
        data?: {
          "automaker-storage"?: string;
          "automaker-setup"?: string;
          "worktree-panel-collapsed"?: string;
          "file-browser-recent-folders"?: string;
          "automaker:lastProjectDir"?: string;
        };
      };

      if (!data || typeof data !== "object") {
        res.status(400).json({
          success: false,
          error: "data object is required containing localStorage data",
        });
        return;
      }

      logger.info("Starting settings migration from localStorage");

      const result = await settingsService.migrateFromLocalStorage(data);

      if (result.success) {
        logger.info(
          `Migration successful: ${result.migratedProjectCount} projects migrated`
        );
      } else {
        logger.warn(`Migration completed with errors: ${result.errors.join(", ")}`);
      }

      res.json({
        success: result.success,
        migratedGlobalSettings: result.migratedGlobalSettings,
        migratedCredentials: result.migratedCredentials,
        migratedProjectCount: result.migratedProjectCount,
        errors: result.errors,
      });
    } catch (error) {
      logError(error, "Migration failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
