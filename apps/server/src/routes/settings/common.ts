/**
 * Common utilities for settings routes
 */

import { createLogger } from "../../lib/logger.js";
import {
  getErrorMessage as getErrorMessageShared,
  createLogError,
} from "../common.js";

export const logger = createLogger("Settings");

// Re-export shared utilities
export { getErrorMessageShared as getErrorMessage };
export const logError = createLogError(logger);
