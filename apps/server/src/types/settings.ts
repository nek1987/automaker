/**
 * Settings Types - Shared types for file-based settings storage
 */

// Theme modes (matching UI ThemeMode type)
export type ThemeMode =
  | "light"
  | "dark"
  | "system"
  | "retro"
  | "dracula"
  | "nord"
  | "monokai"
  | "tokyonight"
  | "solarized"
  | "gruvbox"
  | "catppuccin"
  | "onedark"
  | "synthwave"
  | "red"
  | "cream"
  | "sunset"
  | "gray";

export type KanbanCardDetailLevel = "minimal" | "standard" | "detailed";
export type AgentModel = "opus" | "sonnet" | "haiku";
export type PlanningMode = "skip" | "lite" | "spec" | "full";
export type ThinkingLevel = "none" | "low" | "medium" | "high" | "ultrathink";
export type ModelProvider = "claude";

// Keyboard Shortcuts
export interface KeyboardShortcuts {
  board: string;
  agent: string;
  spec: string;
  context: string;
  settings: string;
  profiles: string;
  terminal: string;
  toggleSidebar: string;
  addFeature: string;
  addContextFile: string;
  startNext: string;
  newSession: string;
  openProject: string;
  projectPicker: string;
  cyclePrevProject: string;
  cycleNextProject: string;
  addProfile: string;
  splitTerminalRight: string;
  splitTerminalDown: string;
  closeTerminal: string;
}

// AI Profile
export interface AIProfile {
  id: string;
  name: string;
  description: string;
  model: AgentModel;
  thinkingLevel: ThinkingLevel;
  provider: ModelProvider;
  isBuiltIn: boolean;
  icon?: string;
}

// Project reference (minimal info stored in global settings)
export interface ProjectRef {
  id: string;
  name: string;
  path: string;
  lastOpened?: string;
  theme?: string;
}

// Trashed project reference
export interface TrashedProjectRef extends ProjectRef {
  trashedAt: string;
  deletedFromDisk?: boolean;
}

// Chat session (minimal info, full content can be loaded separately)
export interface ChatSessionRef {
  id: string;
  title: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  archived: boolean;
}

/**
 * Global Settings - stored in {DATA_DIR}/settings.json
 */
export interface GlobalSettings {
  version: number;

  // Theme
  theme: ThemeMode;

  // UI State
  sidebarOpen: boolean;
  chatHistoryOpen: boolean;
  kanbanCardDetailLevel: KanbanCardDetailLevel;

  // Feature Defaults
  maxConcurrency: number;
  defaultSkipTests: boolean;
  enableDependencyBlocking: boolean;
  useWorktrees: boolean;
  showProfilesOnly: boolean;
  defaultPlanningMode: PlanningMode;
  defaultRequirePlanApproval: boolean;
  defaultAIProfileId: string | null;

  // Audio
  muteDoneSound: boolean;

  // Enhancement
  enhancementModel: AgentModel;

  // Keyboard Shortcuts
  keyboardShortcuts: KeyboardShortcuts;

  // AI Profiles
  aiProfiles: AIProfile[];

  // Projects
  projects: ProjectRef[];
  trashedProjects: TrashedProjectRef[];
  projectHistory: string[];
  projectHistoryIndex: number;

  // UI Preferences (previously in direct localStorage)
  lastProjectDir?: string;
  recentFolders: string[];
  worktreePanelCollapsed: boolean;

  // Session tracking (per-project, keyed by project path)
  lastSelectedSessionByProject: Record<string, string>;
}

/**
 * Credentials - stored in {DATA_DIR}/credentials.json
 */
export interface Credentials {
  version: number;
  apiKeys: {
    anthropic: string;
    google: string;
    openai: string;
  };
}

/**
 * Board Background Settings
 */
export interface BoardBackgroundSettings {
  imagePath: string | null;
  imageVersion?: number;
  cardOpacity: number;
  columnOpacity: number;
  columnBorderEnabled: boolean;
  cardGlassmorphism: boolean;
  cardBorderEnabled: boolean;
  cardBorderOpacity: number;
  hideScrollbar: boolean;
}

/**
 * Worktree Info
 */
export interface WorktreeInfo {
  path: string;
  branch: string;
  isMain: boolean;
  hasChanges?: boolean;
  changedFilesCount?: number;
}

/**
 * Per-Project Settings - stored in {projectPath}/.automaker/settings.json
 */
export interface ProjectSettings {
  version: number;

  // Theme override (null = use global)
  theme?: ThemeMode;

  // Worktree settings
  useWorktrees?: boolean;
  currentWorktree?: { path: string | null; branch: string };
  worktrees?: WorktreeInfo[];

  // Board background
  boardBackground?: BoardBackgroundSettings;

  // Last selected session
  lastSelectedSessionId?: string;
}

// Default values
export const DEFAULT_KEYBOARD_SHORTCUTS: KeyboardShortcuts = {
  board: "K",
  agent: "A",
  spec: "D",
  context: "C",
  settings: "S",
  profiles: "M",
  terminal: "T",
  toggleSidebar: "`",
  addFeature: "N",
  addContextFile: "N",
  startNext: "G",
  newSession: "N",
  openProject: "O",
  projectPicker: "P",
  cyclePrevProject: "Q",
  cycleNextProject: "E",
  addProfile: "N",
  splitTerminalRight: "Alt+D",
  splitTerminalDown: "Alt+S",
  closeTerminal: "Alt+W",
};

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  version: 1,
  theme: "dark",
  sidebarOpen: true,
  chatHistoryOpen: false,
  kanbanCardDetailLevel: "standard",
  maxConcurrency: 3,
  defaultSkipTests: true,
  enableDependencyBlocking: true,
  useWorktrees: false,
  showProfilesOnly: false,
  defaultPlanningMode: "skip",
  defaultRequirePlanApproval: false,
  defaultAIProfileId: null,
  muteDoneSound: false,
  enhancementModel: "sonnet",
  keyboardShortcuts: DEFAULT_KEYBOARD_SHORTCUTS,
  aiProfiles: [],
  projects: [],
  trashedProjects: [],
  projectHistory: [],
  projectHistoryIndex: -1,
  lastProjectDir: undefined,
  recentFolders: [],
  worktreePanelCollapsed: false,
  lastSelectedSessionByProject: {},
};

export const DEFAULT_CREDENTIALS: Credentials = {
  version: 1,
  apiKeys: {
    anthropic: "",
    google: "",
    openai: "",
  },
};

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  version: 1,
};

export const SETTINGS_VERSION = 1;
export const CREDENTIALS_VERSION = 1;
export const PROJECT_SETTINGS_VERSION = 1;
