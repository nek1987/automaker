/**
 * GET /api/settings/status - Get settings migration status
 * Returns whether settings files exist (to determine if migration is needed)
 */

import type { Request, Response } from "express";
import type { SettingsService } from "../../../services/settings-service.js";
import { getErrorMessage, logError } from "../common.js";

export function createStatusHandler(settingsService: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const hasGlobalSettings = await settingsService.hasGlobalSettings();
      const hasCredentials = await settingsService.hasCredentials();

      res.json({
        success: true,
        hasGlobalSettings,
        hasCredentials,
        dataDir: settingsService.getDataDir(),
        needsMigration: !hasGlobalSettings,
      });
    } catch (error) {
      logError(error, "Get settings status failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
