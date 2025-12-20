/**
 * GET /api/settings/global - Get global settings
 */

import type { Request, Response } from "express";
import type { SettingsService } from "../../../services/settings-service.js";
import { getErrorMessage, logError } from "../common.js";

export function createGetGlobalHandler(settingsService: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const settings = await settingsService.getGlobalSettings();

      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      logError(error, "Get global settings failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
