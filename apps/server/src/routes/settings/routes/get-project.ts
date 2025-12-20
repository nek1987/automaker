/**
 * POST /api/settings/project - Get project settings
 * Uses POST because projectPath may contain special characters
 */

import type { Request, Response } from "express";
import type { SettingsService } from "../../../services/settings-service.js";
import { getErrorMessage, logError } from "../common.js";

export function createGetProjectHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath?: string };

      if (!projectPath || typeof projectPath !== "string") {
        res.status(400).json({
          success: false,
          error: "projectPath is required",
        });
        return;
      }

      const settings = await settingsService.getProjectSettings(projectPath);

      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      logError(error, "Get project settings failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
