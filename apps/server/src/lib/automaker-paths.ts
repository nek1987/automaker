/**
 * Automaker Paths - Utilities for managing automaker data storage
 *
 * Stores project data inside the project directory at {projectPath}/.automaker/
 */

import fs from "fs/promises";
import path from "path";

/**
 * Get the automaker data directory for a project
 * This is stored inside the project at .automaker/
 */
export function getAutomakerDir(projectPath: string): string {
  return path.join(projectPath, ".automaker");
}

/**
 * Get the features directory for a project
 */
export function getFeaturesDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), "features");
}

/**
 * Get the directory for a specific feature
 */
export function getFeatureDir(projectPath: string, featureId: string): string {
  return path.join(getFeaturesDir(projectPath), featureId);
}

/**
 * Get the images directory for a feature
 */
export function getFeatureImagesDir(
  projectPath: string,
  featureId: string
): string {
  return path.join(getFeatureDir(projectPath, featureId), "images");
}

/**
 * Get the board directory for a project (board backgrounds, etc.)
 */
export function getBoardDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), "board");
}

/**
 * Get the images directory for a project (general images)
 */
export function getImagesDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), "images");
}

/**
 * Get the context files directory for a project (user-added context files)
 */
export function getContextDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), "context");
}

/**
 * Get the worktrees metadata directory for a project
 */
export function getWorktreesDir(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), "worktrees");
}

/**
 * Get the app spec file path for a project
 */
export function getAppSpecPath(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), "app_spec.txt");
}

/**
 * Get the branch tracking file path for a project
 */
export function getBranchTrackingPath(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), "active-branches.json");
}

/**
 * Ensure the automaker directory structure exists for a project
 */
export async function ensureAutomakerDir(projectPath: string): Promise<string> {
  const automakerDir = getAutomakerDir(projectPath);
  await fs.mkdir(automakerDir, { recursive: true });
  return automakerDir;
}

// ============================================================================
// Global Settings Paths (stored in DATA_DIR from app.getPath('userData'))
// ============================================================================

/**
 * Get the global settings file path
 * DATA_DIR is typically ~/Library/Application Support/automaker (macOS)
 * or %APPDATA%\automaker (Windows) or ~/.config/automaker (Linux)
 */
export function getGlobalSettingsPath(dataDir: string): string {
  return path.join(dataDir, "settings.json");
}

/**
 * Get the credentials file path (separate from settings for security)
 */
export function getCredentialsPath(dataDir: string): string {
  return path.join(dataDir, "credentials.json");
}

/**
 * Get the project settings file path within a project's .automaker directory
 */
export function getProjectSettingsPath(projectPath: string): string {
  return path.join(getAutomakerDir(projectPath), "settings.json");
}

/**
 * Ensure the global data directory exists
 */
export async function ensureDataDir(dataDir: string): Promise<string> {
  await fs.mkdir(dataDir, { recursive: true });
  return dataDir;
}
