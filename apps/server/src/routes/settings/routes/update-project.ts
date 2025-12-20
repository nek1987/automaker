/**
 * PUT /api/settings/project - Update project settings
 */

import type { Request, Response } from "express";
import type { SettingsService } from "../../../services/settings-service.js";
import type { ProjectSettings } from "../../../types/settings.js";
import { getErrorMessage, logError } from "../common.js";

export function createUpdateProjectHandler(settingsService: SettingsService) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath, updates } = req.body as {
        projectPath?: string;
        updates?: Partial<ProjectSettings>;
      };

      if (!projectPath || typeof projectPath !== "string") {
        res.status(400).json({
          success: false,
          error: "projectPath is required",
        });
        return;
      }

      if (!updates || typeof updates !== "object") {
        res.status(400).json({
          success: false,
          error: "updates object is required",
        });
        return;
      }

      const settings = await settingsService.updateProjectSettings(
        projectPath,
        updates
      );

      res.json({
        success: true,
        settings,
      });
    } catch (error) {
      logError(error, "Update project settings failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
