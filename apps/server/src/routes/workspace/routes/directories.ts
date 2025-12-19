/**
 * GET /directories endpoint - List directories in workspace
 */

import type { Request, Response } from "express";
import fs from "fs/promises";
import path from "path";
import { addAllowedPath } from "@automaker/platform";
import { getErrorMessage, logError } from "../common.js";

export function createDirectoriesHandler() {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const workspaceDir = process.env.WORKSPACE_DIR;

      if (!workspaceDir) {
        res.status(400).json({
          success: false,
          error: "WORKSPACE_DIR is not configured",
        });
        return;
      }

      // Check if directory exists
      try {
        await fs.stat(workspaceDir);
      } catch {
        res.status(400).json({
          success: false,
          error: "WORKSPACE_DIR path does not exist",
        });
        return;
      }

      // Add workspace dir to allowed paths
      addAllowedPath(workspaceDir);

      // Read directory contents
      const entries = await fs.readdir(workspaceDir, { withFileTypes: true });

      // Filter to directories only and map to result format
      const directories = entries
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
        .map((entry) => ({
          name: entry.name,
          path: path.join(workspaceDir, entry.name),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      // Add each directory to allowed paths
      directories.forEach((dir) => addAllowedPath(dir.path));

      res.json({
        success: true,
        directories,
      });
    } catch (error) {
      logError(error, "List workspace directories failed");
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
