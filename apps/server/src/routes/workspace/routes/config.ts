/**
 * GET /config endpoint - Get workspace configuration status
 */

import type { Request, Response } from "express";
import fs from "fs/promises";
import { addAllowedPath } from "@automaker/platform";
import { getErrorMessage, logError } from "../common.js";

export function createConfigHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const workspaceDir = process.env.WORKSPACE_DIR;

      if (!workspaceDir) {
        res.json({
          success: true,
          configured: false,
        });
        return;
      }

      // Check if the directory exists
      try {
        const stats = await fs.stat(workspaceDir);
        if (!stats.isDirectory()) {
          res.json({
            success: true,
            configured: false,
            error: "WORKSPACE_DIR is not a valid directory",
          });
          return;
        }

        // Add workspace dir to allowed paths
        addAllowedPath(workspaceDir);

        res.json({
          success: true,
          configured: true,
          workspaceDir,
        });
      } catch {
        res.json({
          success: true,
          configured: false,
          error: "WORKSPACE_DIR path does not exist",
        });
      }
    } catch (error) {
      logError(error, "Get workspace config failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
