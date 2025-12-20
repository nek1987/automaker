/**
 * Settings Migration Hook
 *
 * This hook handles migrating settings from localStorage to file-based storage.
 * It runs on app startup and:
 * 1. Checks if server has settings files
 * 2. If not, migrates localStorage data to server
 * 3. Clears old localStorage keys after successful migration
 *
 * This approach keeps localStorage as a fast cache while ensuring
 * settings are persisted to files that survive app updates.
 */

import { useEffect, useState, useRef } from "react";
import { getHttpApiClient } from "@/lib/http-api-client";
import { isElectron } from "@/lib/electron";

interface MigrationState {
  checked: boolean;
  migrated: boolean;
  error: string | null;
}

// localStorage keys to migrate
const LOCALSTORAGE_KEYS = [
  "automaker-storage",
  "automaker-setup",
  "worktree-panel-collapsed",
  "file-browser-recent-folders",
  "automaker:lastProjectDir",
] as const;

// Keys to clear after migration (not automaker-storage as it's still used by Zustand)
const KEYS_TO_CLEAR_AFTER_MIGRATION = [
  "worktree-panel-collapsed",
  "file-browser-recent-folders",
  "automaker:lastProjectDir",
  // Legacy keys
  "automaker_projects",
  "automaker_current_project",
  "automaker_trashed_projects",
] as const;

/**
 * Hook to handle settings migration from localStorage to file-based storage
 */
export function useSettingsMigration(): MigrationState {
  const [state, setState] = useState<MigrationState>({
    checked: false,
    migrated: false,
    error: null,
  });
  const migrationAttempted = useRef(false);

  useEffect(() => {
    // Only run once
    if (migrationAttempted.current) return;
    migrationAttempted.current = true;

    async function checkAndMigrate() {
      // Only run migration in Electron mode (web mode uses different storage)
      if (!isElectron()) {
        setState({ checked: true, migrated: false, error: null });
        return;
      }

      try {
        const api = getHttpApiClient();

        // Check if server has settings files
        const status = await api.settings.getStatus();

        if (!status.success) {
          console.error("[Settings Migration] Failed to get status:", status);
          setState({
            checked: true,
            migrated: false,
            error: "Failed to check settings status",
          });
          return;
        }

        // If settings files already exist, no migration needed
        if (!status.needsMigration) {
          console.log(
            "[Settings Migration] Settings files exist, no migration needed"
          );
          setState({ checked: true, migrated: false, error: null });
          return;
        }

        // Check if we have localStorage data to migrate
        const automakerStorage = localStorage.getItem("automaker-storage");
        if (!automakerStorage) {
          console.log(
            "[Settings Migration] No localStorage data to migrate"
          );
          setState({ checked: true, migrated: false, error: null });
          return;
        }

        console.log("[Settings Migration] Starting migration...");

        // Collect all localStorage data
        const localStorageData: Record<string, string> = {};
        for (const key of LOCALSTORAGE_KEYS) {
          const value = localStorage.getItem(key);
          if (value) {
            localStorageData[key] = value;
          }
        }

        // Send to server for migration
        const result = await api.settings.migrate(localStorageData);

        if (result.success) {
          console.log("[Settings Migration] Migration successful:", {
            globalSettings: result.migratedGlobalSettings,
            credentials: result.migratedCredentials,
            projects: result.migratedProjectCount,
          });

          // Clear old localStorage keys (but keep automaker-storage for Zustand)
          for (const key of KEYS_TO_CLEAR_AFTER_MIGRATION) {
            localStorage.removeItem(key);
          }

          setState({ checked: true, migrated: true, error: null });
        } else {
          console.warn(
            "[Settings Migration] Migration had errors:",
            result.errors
          );
          setState({
            checked: true,
            migrated: false,
            error: result.errors.join(", "),
          });
        }
      } catch (error) {
        console.error("[Settings Migration] Migration failed:", error);
        setState({
          checked: true,
          migrated: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    checkAndMigrate();
  }, []);

  return state;
}

/**
 * Sync current settings to the server
 * Call this when important settings change
 */
export async function syncSettingsToServer(): Promise<boolean> {
  if (!isElectron()) return false;

  try {
    const api = getHttpApiClient();
    const automakerStorage = localStorage.getItem("automaker-storage");

    if (!automakerStorage) {
      return false;
    }

    const parsed = JSON.parse(automakerStorage);
    const state = parsed.state || parsed;

    // Extract settings to sync
    const updates = {
      theme: state.theme,
      sidebarOpen: state.sidebarOpen,
      chatHistoryOpen: state.chatHistoryOpen,
      kanbanCardDetailLevel: state.kanbanCardDetailLevel,
      maxConcurrency: state.maxConcurrency,
      defaultSkipTests: state.defaultSkipTests,
      enableDependencyBlocking: state.enableDependencyBlocking,
      useWorktrees: state.useWorktrees,
      showProfilesOnly: state.showProfilesOnly,
      defaultPlanningMode: state.defaultPlanningMode,
      defaultRequirePlanApproval: state.defaultRequirePlanApproval,
      defaultAIProfileId: state.defaultAIProfileId,
      muteDoneSound: state.muteDoneSound,
      enhancementModel: state.enhancementModel,
      keyboardShortcuts: state.keyboardShortcuts,
      aiProfiles: state.aiProfiles,
      projects: state.projects,
      trashedProjects: state.trashedProjects,
      projectHistory: state.projectHistory,
      projectHistoryIndex: state.projectHistoryIndex,
      lastSelectedSessionByProject: state.lastSelectedSessionByProject,
    };

    const result = await api.settings.updateGlobal(updates);
    return result.success;
  } catch (error) {
    console.error("[Settings Sync] Failed to sync settings:", error);
    return false;
  }
}

/**
 * Sync credentials to the server
 * Call this when API keys change
 */
export async function syncCredentialsToServer(apiKeys: {
  anthropic?: string;
  google?: string;
  openai?: string;
}): Promise<boolean> {
  if (!isElectron()) return false;

  try {
    const api = getHttpApiClient();
    const result = await api.settings.updateCredentials({ apiKeys });
    return result.success;
  } catch (error) {
    console.error("[Settings Sync] Failed to sync credentials:", error);
    return false;
  }
}

/**
 * Sync project settings to the server
 * Call this when project-specific settings change
 */
export async function syncProjectSettingsToServer(
  projectPath: string,
  updates: {
    theme?: string;
    useWorktrees?: boolean;
    boardBackground?: Record<string, unknown>;
    currentWorktree?: { path: string | null; branch: string };
    worktrees?: Array<{
      path: string;
      branch: string;
      isMain: boolean;
      hasChanges?: boolean;
      changedFilesCount?: number;
    }>;
  }
): Promise<boolean> {
  if (!isElectron()) return false;

  try {
    const api = getHttpApiClient();
    const result = await api.settings.updateProject(projectPath, updates);
    return result.success;
  } catch (error) {
    console.error(
      "[Settings Sync] Failed to sync project settings:",
      error
    );
    return false;
  }
}
