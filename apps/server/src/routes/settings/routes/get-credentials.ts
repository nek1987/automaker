/**
 * GET /api/settings/credentials - Get credentials (masked for security)
 */

import type { Request, Response } from "express";
import type { SettingsService } from "../../../services/settings-service.js";
import { getErrorMessage, logError } from "../common.js";

export function createGetCredentialsHandler(settingsService: SettingsService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const credentials = await settingsService.getMaskedCredentials();

      res.json({
        success: true,
        credentials,
      });
    } catch (error) {
      logError(error, "Get credentials failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
