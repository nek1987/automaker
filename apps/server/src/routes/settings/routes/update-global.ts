/**
 * PUT /api/settings/global - Update global settings
 */

import type { Request, Response } from "express";
import type { SettingsService } from "../../../services/settings-service.js";
import type { GlobalSettings } from "../../../types/settings.js";
import { getErrorMessage, logError } from "../common.js";

export function createUpdateGlobalHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const updates = req.body as Partial<GlobalSettings>;

      if (!updates || typeof updates !== "object") {
        res.status(400).json({
          success: false,
          error: "Invalid request body - expected settings object",
        });
        return;
      }

      const settings = await settingsService.updateGlobalSettings(updates);

      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      logError(error, "Update global settings failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
