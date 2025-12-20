/**
 * PUT /api/settings/credentials - Update credentials
 */

import type { Request, Response } from "express";
import type { SettingsService } from "../../../services/settings-service.js";
import type { Credentials } from "../../../types/settings.js";
import { getErrorMessage, logError } from "../common.js";

export function createUpdateCredentialsHandler(
  settingsService: SettingsService
) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const updates = req.body as Partial<Credentials>;

      if (!updates || typeof updates !== "object") {
        res.status(400).json({
          success: false,
          error: "Invalid request body - expected credentials object",
        });
        return;
      }

      await settingsService.updateCredentials(updates);

      // Return masked credentials for confirmation
      const masked = await settingsService.getMaskedCredentials();

      res.json({
        success: true,
        credentials: masked,
      });
    } catch (error) {
      logError(error, "Update credentials failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
