/**
 * POST /list endpoint - List all features for a project
 */

import type { Request, Response } from "express";
import { FeatureLoader } from "../../../services/feature-loader.js";
import { addAllowedPath } from "@automaker/platform";
import { getErrorMessage, logError } from "../common.js";

export function createListHandler(featureLoader: FeatureLoader) {
  return async (req: Request, res: Response): Promise<void> => {
    try {
      const { projectPath } = req.body as { projectPath: string };

      if (!projectPath) {
        res
          .status(400)
          .json({ success: false, error: "projectPath is required" });
        return;
      }

      // Add project path to allowed paths
      addAllowedPath(projectPath);

      const features = await featureLoader.getAll(projectPath);
      res.json({ success: true, features });
    } catch (error) {
      logError(error, "List features failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
