/**
 * @automaker/platform
 * Platform-specific utilities for AutoMaker
 */

// Path utilities
export {
  getAutomakerDir,
  getFeaturesDir,
  getFeatureDir,
  getFeatureImagesDir,
  getBoardDir,
  getImagesDir,
  getContextDir,
  getWorktreesDir,
  getAppSpecPath,
  getBranchTrackingPath,
  ensureAutomakerDir,
  getGlobalSettingsPath,
  getCredentialsPath,
  getProjectSettingsPath,
  ensureDataDir,
} from './paths';

// Subprocess management
export {
  spawnJSONLProcess,
  spawnProcess,
  type SubprocessOptions,
  type SubprocessResult,
} from './subprocess';

// Security
export {
  initAllowedPaths,
  addAllowedPath,
  isPathAllowed,
  validatePath,
  getAllowedPaths,
} from './security';
