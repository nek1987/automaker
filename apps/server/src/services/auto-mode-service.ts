/**
 * Auto Mode Service - Autonomous feature implementation using Claude Agent SDK
 *
 * Manages:
 * - Worktree creation for isolated development
 * - Feature execution with Claude
 * - Concurrent execution with max concurrency limits
 * - Progress streaming via events
 * - Verification and merge workflows
 */

import { ProviderFactory } from "../providers/provider-factory.js";
import type { ExecuteOptions } from "../providers/types.js";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import type { EventEmitter } from "../lib/events.js";
import { buildPromptWithImages } from "../lib/prompt-builder.js";
import { resolveModelString, DEFAULT_MODELS } from "../lib/model-resolver.js";
import { createAutoModeOptions } from "../lib/sdk-options.js";
import { isAbortError, classifyError } from "../lib/error-handler.js";
import type { Feature } from "./feature-loader.js";
import { FeatureLoader } from "./feature-loader.js";
import { getFeatureDir, getAutomakerDir } from "../lib/automaker-paths.js";

const execAsync = promisify(exec);

interface RunningFeature {
  featureId: string;
  projectPath: string;
  worktreePath: string | null;
  branchName: string | null;
  abortController: AbortController;
  isAutoMode: boolean;
  startTime: number;
}

interface AutoLoopState {
  projectPath: string;
  maxConcurrency: number;
  abortController: AbortController;
  isRunning: boolean;
}

export class AutoModeService {
  private events: EventEmitter;
  private runningFeatures = new Map<string, RunningFeature>();
  private autoLoop: AutoLoopState | null = null;
  private featureLoader = new FeatureLoader();

  constructor(events: EventEmitter) {
    this.events = events;
  }

  /**
   * Execute a single feature
   * @param projectPath - The main project path
   * @param featureId - The feature ID to execute
   * @param useWorktrees - Whether to use worktrees for isolation
   * @param isAutoMode - Whether this is running in auto mode
   */
  async executeFeature(
    projectPath: string,
    featureId: string,
    useWorktrees = false,
    isAutoMode = false
  ): Promise<void> {
    if (this.runningFeatures.has(featureId)) {
      throw new Error("already running");
    }

    // Add to running features immediately to prevent race conditions
    const abortController = new AbortController();
    const tempRunningFeature: RunningFeature = {
      featureId,
      projectPath,
      worktreePath: null,
      branchName: null,
      abortController,
      isAutoMode,
      startTime: Date.now(),
    };
    this.runningFeatures.set(featureId, tempRunningFeature);

    try {
      // Check if feature has existing context - if so, resume instead of starting fresh
      const hasExistingContext = await this.contextExists(
        projectPath,
        featureId
      );
      if (hasExistingContext) {
        console.log(
          `[AutoMode] Feature ${featureId} has existing context, resuming instead of starting fresh`
        );
        // Remove from running features temporarily, resumeFeature will add it back
        this.runningFeatures.delete(featureId);
        return this.resumeFeature(projectPath, featureId, useWorktrees);
      }

      // Emit feature start event early
      this.emitAutoModeEvent("auto_mode_feature_start", {
        featureId,
        projectPath,
        feature: {
          id: featureId,
          title: "Loading...",
          description: "Feature is starting",
        },
      });
      // Load feature details FIRST to get branchName
      const feature = await this.loadFeature(projectPath, featureId);
      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      // Derive workDir from feature.branchName
      // If no branchName, derive from feature ID: feature/{featureId}
      let worktreePath: string | null = null;
      const branchName = feature.branchName || `feature/${featureId}`;

      if (useWorktrees && branchName) {
        // Try to find existing worktree for this branch
        worktreePath = await this.findExistingWorktreeForBranch(
          projectPath,
          branchName
        );

        if (!worktreePath) {
          // Create worktree for this branch
          worktreePath = await this.setupWorktree(
            projectPath,
            featureId,
            branchName
          );
        }

        console.log(
          `[AutoMode] Using worktree for branch "${branchName}": ${worktreePath}`
        );
      }

      // Ensure workDir is always an absolute path for cross-platform compatibility
      const workDir = worktreePath
        ? path.resolve(worktreePath)
        : path.resolve(projectPath);

      // Update running feature with actual worktree info
      tempRunningFeature.worktreePath = worktreePath;
      tempRunningFeature.branchName = branchName;

      // Update feature status to in_progress
      await this.updateFeatureStatus(projectPath, featureId, "in_progress");

      // Build the prompt
      const prompt = this.buildFeaturePrompt(feature);

      // Extract image paths from feature
      const imagePaths = feature.imagePaths?.map((img) =>
        typeof img === "string" ? img : img.path
      );

      // Get model from feature
      const model = resolveModelString(feature.model, DEFAULT_MODELS.claude);
      console.log(
        `[AutoMode] Executing feature ${featureId} with model: ${model} in ${workDir}`
      );

      // Run the agent with the feature's model and images
      await this.runAgent(
        workDir,
        featureId,
        prompt,
        abortController,
        projectPath,
        imagePaths,
        model
      );

      // Mark as waiting_approval for user review
      await this.updateFeatureStatus(
        projectPath,
        featureId,
        "waiting_approval"
      );

      this.emitAutoModeEvent("auto_mode_feature_complete", {
        featureId,
        passes: true,
        message: `Feature completed in ${Math.round(
          (Date.now() - tempRunningFeature.startTime) / 1000
        )}s`,
        projectPath,
      });
    } catch (error) {
      const errorInfo = classifyError(error);

      if (errorInfo.isAbort) {
        this.emitAutoModeEvent("auto_mode_feature_complete", {
          featureId,
          passes: false,
          message: "Feature stopped by user",
          projectPath,
        });
      } else {
        console.error(`[AutoMode] Feature ${featureId} failed:`, error);
        await this.updateFeatureStatus(projectPath, featureId, "backlog");
        this.emitAutoModeEvent("auto_mode_error", {
          featureId,
          error: errorInfo.message,
          errorType: errorInfo.isAuth ? "authentication" : "execution",
          projectPath,
        });
      }
    } finally {
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Stop a specific feature
   */
  async stopFeature(featureId: string): Promise<boolean> {
    const running = this.runningFeatures.get(featureId);
    if (!running) {
      return false;
    }

    running.abortController.abort();
    return true;
  }

  /**
   * Resume a feature (continues from saved context)
   */
  async resumeFeature(
    projectPath: string,
    featureId: string,
    useWorktrees = false
  ): Promise<void> {
    if (this.runningFeatures.has(featureId)) {
      throw new Error("already running");
    }

    // Check if context exists in .automaker directory
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, "agent-output.md");

    let hasContext = false;
    try {
      await fs.access(contextPath);
      hasContext = true;
    } catch {
      // No context
    }

    if (hasContext) {
      // Load previous context and continue
      const context = await fs.readFile(contextPath, "utf-8");
      return this.executeFeatureWithContext(
        projectPath,
        featureId,
        context,
        useWorktrees
      );
    }

    // No context, start fresh - executeFeature will handle adding to runningFeatures
    // Remove the temporary entry we added
    this.runningFeatures.delete(featureId);
    return this.executeFeature(projectPath, featureId, useWorktrees, false);
  }

  /**
   * Follow up on a feature with additional instructions
   */
  async followUpFeature(
    projectPath: string,
    featureId: string,
    prompt: string,
    imagePaths?: string[],
    useWorktrees = true
  ): Promise<void> {
    if (this.runningFeatures.has(featureId)) {
      throw new Error(`Feature ${featureId} is already running`);
    }

    const abortController = new AbortController();

    // Load feature info for context FIRST to get branchName
    const feature = await this.loadFeature(projectPath, featureId);

    // Derive workDir from feature.branchName
    // If no branchName, derive from feature ID: feature/{featureId}
    let workDir = path.resolve(projectPath);
    let worktreePath: string | null = null;
    const branchName = feature?.branchName || `feature/${featureId}`;

    if (useWorktrees && branchName) {
      // Try to find existing worktree for this branch
      worktreePath = await this.findExistingWorktreeForBranch(
        projectPath,
        branchName
      );

      if (worktreePath) {
        workDir = worktreePath;
        console.log(
          `[AutoMode] Follow-up using worktree for branch "${branchName}": ${workDir}`
        );
      }
    }

    // Load previous agent output if it exists
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, "agent-output.md");
    let previousContext = "";
    try {
      previousContext = await fs.readFile(contextPath, "utf-8");
    } catch {
      // No previous context
    }

    // Build complete prompt with feature info, previous context, and follow-up instructions
    let fullPrompt = `## Follow-up on Feature Implementation

${feature ? this.buildFeaturePrompt(feature) : `**Feature ID:** ${featureId}`}
`;

    if (previousContext) {
      fullPrompt += `
## Previous Agent Work
The following is the output from the previous implementation attempt:

${previousContext}
`;
    }

    fullPrompt += `
## Follow-up Instructions
${prompt}

## Task
Address the follow-up instructions above. Review the previous work and make the requested changes or fixes.`;

    this.runningFeatures.set(featureId, {
      featureId,
      projectPath,
      worktreePath,
      branchName,
      abortController,
      isAutoMode: false,
      startTime: Date.now(),
    });

    this.emitAutoModeEvent("auto_mode_feature_start", {
      featureId,
      projectPath,
      feature: feature || {
        id: featureId,
        title: "Follow-up",
        description: prompt.substring(0, 100),
      },
    });

    try {
      // Get model from feature (already loaded above)
      const model = resolveModelString(feature?.model, DEFAULT_MODELS.claude);
      console.log(
        `[AutoMode] Follow-up for feature ${featureId} using model: ${model}`
      );

      // Update feature status to in_progress
      await this.updateFeatureStatus(projectPath, featureId, "in_progress");

      // Copy follow-up images to feature folder
      const copiedImagePaths: string[] = [];
      if (imagePaths && imagePaths.length > 0) {
        const featureDirForImages = getFeatureDir(projectPath, featureId);
        const featureImagesDir = path.join(featureDirForImages, "images");

        await fs.mkdir(featureImagesDir, { recursive: true });

        for (const imagePath of imagePaths) {
          try {
            // Get the filename from the path
            const filename = path.basename(imagePath);
            const destPath = path.join(featureImagesDir, filename);

            // Copy the image
            await fs.copyFile(imagePath, destPath);

            // Store the absolute path (external storage uses absolute paths)
            copiedImagePaths.push(destPath);
          } catch (error) {
            console.error(
              `[AutoMode] Failed to copy follow-up image ${imagePath}:`,
              error
            );
          }
        }
      }

      // Update feature object with new follow-up images BEFORE building prompt
      if (copiedImagePaths.length > 0 && feature) {
        const currentImagePaths = feature.imagePaths || [];
        const newImagePaths = copiedImagePaths.map((p) => ({
          path: p,
          filename: path.basename(p),
          mimeType: "image/png", // Default, could be improved
        }));

        feature.imagePaths = [...currentImagePaths, ...newImagePaths];
      }

      // Combine original feature images with new follow-up images
      const allImagePaths: string[] = [];

      // Add all images from feature (now includes both original and new)
      if (feature?.imagePaths) {
        const allPaths = feature.imagePaths.map((img) =>
          typeof img === "string" ? img : img.path
        );
        allImagePaths.push(...allPaths);
      }

      // Save updated feature.json with new images
      if (copiedImagePaths.length > 0 && feature) {
        const featureDirForSave = getFeatureDir(projectPath, featureId);
        const featurePath = path.join(featureDirForSave, "feature.json");

        try {
          await fs.writeFile(featurePath, JSON.stringify(feature, null, 2));
        } catch (error) {
          console.error(`[AutoMode] Failed to save feature.json:`, error);
        }
      }

      // Use fullPrompt (already built above) with model and all images
      // Pass previousContext so the history is preserved in the output file
      await this.runAgent(
        workDir,
        featureId,
        fullPrompt,
        abortController,
        projectPath,
        allImagePaths.length > 0 ? allImagePaths : imagePaths,
        model,
        previousContext || undefined
      );

      // Mark as waiting_approval for user review
      await this.updateFeatureStatus(
        projectPath,
        featureId,
        "waiting_approval"
      );

      this.emitAutoModeEvent("auto_mode_feature_complete", {
        featureId,
        passes: true,
        message: "Follow-up completed successfully",
        projectPath,
      });
    } catch (error) {
      if (!isAbortError(error)) {
        this.emitAutoModeEvent("auto_mode_error", {
          featureId,
          error: (error as Error).message,
          projectPath,
        });
      }
    } finally {
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Verify a feature's implementation
   */
  async verifyFeature(
    projectPath: string,
    featureId: string
  ): Promise<boolean> {
    // Worktrees are in project dir
    const worktreePath = path.join(projectPath, ".worktrees", featureId);
    let workDir = projectPath;

    try {
      await fs.access(worktreePath);
      workDir = worktreePath;
    } catch {
      // No worktree
    }

    // Run verification - check if tests pass, build works, etc.
    const verificationChecks = [
      { cmd: "npm run lint", name: "Lint" },
      { cmd: "npm run typecheck", name: "Type check" },
      { cmd: "npm test", name: "Tests" },
      { cmd: "npm run build", name: "Build" },
    ];

    let allPassed = true;
    const results: Array<{ check: string; passed: boolean; output?: string }> =
      [];

    for (const check of verificationChecks) {
      try {
        const { stdout, stderr } = await execAsync(check.cmd, {
          cwd: workDir,
          timeout: 120000,
        });
        results.push({
          check: check.name,
          passed: true,
          output: stdout || stderr,
        });
      } catch (error) {
        allPassed = false;
        results.push({
          check: check.name,
          passed: false,
          output: (error as Error).message,
        });
        break; // Stop on first failure
      }
    }

    this.emitAutoModeEvent("auto_mode_feature_complete", {
      featureId,
      passes: allPassed,
      message: allPassed
        ? "All verification checks passed"
        : `Verification failed: ${
            results.find((r) => !r.passed)?.check || "Unknown"
          }`,
    });

    return allPassed;
  }

  /**
   * Commit feature changes
   * @param projectPath - The main project path
   * @param featureId - The feature ID to commit
   * @param providedWorktreePath - Optional: the worktree path where the feature's changes are located
   */
  async commitFeature(
    projectPath: string,
    featureId: string,
    providedWorktreePath?: string
  ): Promise<string | null> {
    let workDir = projectPath;

    // Use the provided worktree path if given
    if (providedWorktreePath) {
      try {
        await fs.access(providedWorktreePath);
        workDir = providedWorktreePath;
        console.log(`[AutoMode] Committing in provided worktree: ${workDir}`);
      } catch {
        console.log(
          `[AutoMode] Provided worktree path doesn't exist: ${providedWorktreePath}, using project path`
        );
      }
    } else {
      // Fallback: try to find worktree at legacy location
      const legacyWorktreePath = path.join(
        projectPath,
        ".worktrees",
        featureId
      );
      try {
        await fs.access(legacyWorktreePath);
        workDir = legacyWorktreePath;
        console.log(`[AutoMode] Committing in legacy worktree: ${workDir}`);
      } catch {
        console.log(
          `[AutoMode] No worktree found, committing in project path: ${workDir}`
        );
      }
    }

    try {
      // Check for changes
      const { stdout: status } = await execAsync("git status --porcelain", {
        cwd: workDir,
      });
      if (!status.trim()) {
        return null; // No changes
      }

      // Load feature for commit message
      const feature = await this.loadFeature(projectPath, featureId);
      const commitMessage = feature
        ? `feat: ${this.extractTitleFromDescription(
            feature.description
          )}\n\nImplemented by Automaker auto-mode`
        : `feat: Feature ${featureId}`;

      // Stage and commit
      await execAsync("git add -A", { cwd: workDir });
      await execAsync(`git commit -m "${commitMessage.replace(/"/g, '\\"')}"`, {
        cwd: workDir,
      });

      // Get commit hash
      const { stdout: hash } = await execAsync("git rev-parse HEAD", {
        cwd: workDir,
      });

      this.emitAutoModeEvent("auto_mode_feature_complete", {
        featureId,
        passes: true,
        message: `Changes committed: ${hash.trim().substring(0, 8)}`,
      });

      return hash.trim();
    } catch (error) {
      console.error(`[AutoMode] Commit failed for ${featureId}:`, error);
      return null;
    }
  }

  /**
   * Check if context exists for a feature
   */
  async contextExists(
    projectPath: string,
    featureId: string
  ): Promise<boolean> {
    // Context is stored in .automaker directory
    const featureDir = getFeatureDir(projectPath, featureId);
    const contextPath = path.join(featureDir, "agent-output.md");

    try {
      await fs.access(contextPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Analyze project to gather context
   */
  async analyzeProject(projectPath: string): Promise<void> {
    const abortController = new AbortController();

    const analysisFeatureId = `analysis-${Date.now()}`;
    this.emitAutoModeEvent("auto_mode_feature_start", {
      featureId: analysisFeatureId,
      projectPath,
      feature: {
        id: analysisFeatureId,
        title: "Project Analysis",
        description: "Analyzing project structure",
      },
    });

    const prompt = `Analyze this project and provide a summary of:
1. Project structure and architecture
2. Main technologies and frameworks used
3. Key components and their responsibilities
4. Build and test commands
5. Any existing conventions or patterns

Format your response as a structured markdown document.`;

    try {
      // Use default Claude model for analysis (can be overridden in the future)
      const analysisModel = resolveModelString(
        undefined,
        DEFAULT_MODELS.claude
      );
      const provider = ProviderFactory.getProviderForModel(analysisModel);

      const options: ExecuteOptions = {
        prompt,
        model: analysisModel,
        maxTurns: 5,
        cwd: projectPath,
        allowedTools: ["Read", "Glob", "Grep"],
        abortController,
      };

      const stream = provider.executeQuery(options);
      let analysisResult = "";

      for await (const msg of stream) {
        if (msg.type === "assistant" && msg.message?.content) {
          for (const block of msg.message.content) {
            if (block.type === "text") {
              analysisResult = block.text || "";
              this.emitAutoModeEvent("auto_mode_progress", {
                featureId: analysisFeatureId,
                content: block.text,
                projectPath,
              });
            }
          }
        } else if (msg.type === "result" && msg.subtype === "success") {
          analysisResult = msg.result || analysisResult;
        }
      }

      // Save analysis to .automaker directory
      const automakerDir = getAutomakerDir(projectPath);
      const analysisPath = path.join(automakerDir, "project-analysis.md");
      await fs.mkdir(automakerDir, { recursive: true });
      await fs.writeFile(analysisPath, analysisResult);

      this.emitAutoModeEvent("auto_mode_feature_complete", {
        featureId: analysisFeatureId,
        passes: true,
        message: "Project analysis completed",
        projectPath,
      });
    } catch (error) {
      this.emitAutoModeEvent("auto_mode_error", {
        featureId: analysisFeatureId,
        error: (error as Error).message,
        projectPath,
      });
    }
  }

  /**
   * Start the auto loop to process pending features
   * @param projectPath - The project path
   * @param maxConcurrency - Maximum number of features to process concurrently
   * @returns Promise that resolves when the loop stops
   */
  async startAutoLoop(
    projectPath: string,
    maxConcurrency: number
  ): Promise<void> {
    if (this.autoLoop?.isRunning) {
      throw new Error("Auto mode is already running");
    }

    const abortController = new AbortController();
    this.autoLoop = {
      projectPath,
      maxConcurrency,
      abortController,
      isRunning: true,
    };

    // Emit start event
    this.emitAutoModeEvent("auto_mode_started", {
      projectPath,
      message: `Auto mode started with max concurrency: ${maxConcurrency}`,
    });

    // Start the loop
    return this.runAutoLoop();
  }

  /**
   * Stop the auto loop
   * @returns Number of running features (should be 0 after stopping)
   */
  async stopAutoLoop(): Promise<number> {
    if (!this.autoLoop?.isRunning) {
      return 0;
    }

    const runningCount = this.runningFeatures.size;
    this.autoLoop.abortController.abort();
    this.autoLoop.isRunning = false;
    this.autoLoop = null;

    // Emit stop event
    this.emitAutoModeEvent("auto_mode_stopped", {
      message: "Auto mode stopped",
      runningCount,
    });

    return runningCount;
  }

  /**
   * Get current status
   */
  getStatus(): {
    isRunning: boolean;
    runningFeatures: string[];
    runningCount: number;
  } {
    return {
      isRunning: this.runningFeatures.size > 0,
      runningFeatures: Array.from(this.runningFeatures.keys()),
      runningCount: this.runningFeatures.size,
    };
  }

  /**
   * Get detailed info about all running agents
   */
  getRunningAgents(): Array<{
    featureId: string;
    projectPath: string;
    projectName: string;
    isAutoMode: boolean;
  }> {
    return Array.from(this.runningFeatures.values()).map((rf) => ({
      featureId: rf.featureId,
      projectPath: rf.projectPath,
      projectName: path.basename(rf.projectPath),
      isAutoMode: rf.isAutoMode,
    }));
  }

  // Private helpers

  /**
   * Run the auto loop to process pending features
   */
  private async runAutoLoop(): Promise<void> {
    if (!this.autoLoop) {
      return;
    }

    const { projectPath, maxConcurrency, abortController } = this.autoLoop;
    const runningPromises = new Map<string, Promise<void>>();

    try {
      while (!abortController.signal.aborted && this.autoLoop.isRunning) {
        // Get all features
        const allFeatures = await this.featureLoader.getAll(projectPath);

        // Filter to pending features that aren't already running
        const pendingFeatures = allFeatures.filter(
          (feature) =>
            feature.status === "pending" &&
            !this.runningFeatures.has(feature.id) &&
            !runningPromises.has(feature.id)
        );

        // Start new features up to max concurrency
        while (
          runningPromises.size < maxConcurrency &&
          pendingFeatures.length > 0 &&
          !abortController.signal.aborted
        ) {
          const feature = pendingFeatures.shift();
          if (!feature) break;

          const promise = this.executeFeature(
            projectPath,
            feature.id,
            true, // useWorktrees
            true // isAutoMode
          )
            .catch((error) => {
              console.error(
                `[AutoMode] Feature ${feature.id} failed in auto loop:`,
                error
              );
            })
            .finally(() => {
              runningPromises.delete(feature.id);
            });

          runningPromises.set(feature.id, promise);
        }

        // Wait a bit before checking again
        if (runningPromises.size > 0) {
          await Promise.race([
            Promise.allSettled(Array.from(runningPromises.values())),
            new Promise<void>((resolve) => {
              abortController.signal.addEventListener(
                "abort",
                () => resolve(),
                {
                  once: true,
                }
              );
            }),
          ]);
        } else {
          // No features running, wait before checking again
          await this.sleep(1000, abortController.signal);
        }
      }
    } catch (error) {
      if (!isAbortError(error)) {
        console.error("[AutoMode] Auto loop error:", error);
      }
    } finally {
      // Wait for all running features to complete
      if (runningPromises.size > 0) {
        await Promise.allSettled(Array.from(runningPromises.values()));
      }
    }
  }

  /**
   * Find an existing worktree for a given branch by checking git worktree list
   */
  private async findExistingWorktreeForBranch(
    projectPath: string,
    branchName: string
  ): Promise<string | null> {
    try {
      const { stdout } = await execAsync("git worktree list --porcelain", {
        cwd: projectPath,
      });

      const lines = stdout.split("\n");
      let currentPath: string | null = null;
      let currentBranch: string | null = null;

      for (const line of lines) {
        if (line.startsWith("worktree ")) {
          currentPath = line.slice(9);
        } else if (line.startsWith("branch ")) {
          currentBranch = line.slice(7).replace("refs/heads/", "");
        } else if (line === "" && currentPath && currentBranch) {
          // End of a worktree entry
          if (currentBranch === branchName) {
            // Resolve to absolute path - git may return relative paths
            // On Windows, this is critical for cwd to work correctly
            // On all platforms, absolute paths ensure consistent behavior
            const resolvedPath = path.isAbsolute(currentPath)
              ? path.resolve(currentPath)
              : path.resolve(projectPath, currentPath);
            return resolvedPath;
          }
          currentPath = null;
          currentBranch = null;
        }
      }

      // Check the last entry (if file doesn't end with newline)
      if (currentPath && currentBranch && currentBranch === branchName) {
        // Resolve to absolute path for cross-platform compatibility
        const resolvedPath = path.isAbsolute(currentPath)
          ? path.resolve(currentPath)
          : path.resolve(projectPath, currentPath);
        return resolvedPath;
      }

      return null;
    } catch {
      return null;
    }
  }

  private async setupWorktree(
    projectPath: string,
    featureId: string,
    branchName: string
  ): Promise<string> {
    // First, check if git already has a worktree for this branch (anywhere)
    const existingWorktree = await this.findExistingWorktreeForBranch(
      projectPath,
      branchName
    );
    if (existingWorktree) {
      // Path is already resolved to absolute in findExistingWorktreeForBranch
      console.log(
        `[AutoMode] Found existing worktree for branch "${branchName}" at: ${existingWorktree}`
      );
      return existingWorktree;
    }

    // Git worktrees stay in project directory
    const worktreesDir = path.join(projectPath, ".worktrees");
    const worktreePath = path.join(worktreesDir, featureId);

    await fs.mkdir(worktreesDir, { recursive: true });

    // Check if worktree directory already exists (might not be linked to branch)
    try {
      await fs.access(worktreePath);
      // Return absolute path for cross-platform compatibility
      return path.resolve(worktreePath);
    } catch {
      // Create new worktree
    }

    // Create branch if it doesn't exist
    try {
      await execAsync(`git branch ${branchName}`, { cwd: projectPath });
    } catch {
      // Branch may already exist
    }

    // Create worktree
    try {
      await execAsync(`git worktree add "${worktreePath}" ${branchName}`, {
        cwd: projectPath,
      });
      // Return absolute path for cross-platform compatibility
      return path.resolve(worktreePath);
    } catch (error) {
      // Worktree creation failed, fall back to direct execution
      console.error(`[AutoMode] Worktree creation failed:`, error);
      return path.resolve(projectPath);
    }
  }

  private async loadFeature(
    projectPath: string,
    featureId: string
  ): Promise<Feature | null> {
    // Features are stored in .automaker directory
    const featureDir = getFeatureDir(projectPath, featureId);
    const featurePath = path.join(featureDir, "feature.json");

    try {
      const data = await fs.readFile(featurePath, "utf-8");
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  private async updateFeatureStatus(
    projectPath: string,
    featureId: string,
    status: string
  ): Promise<void> {
    // Features are stored in .automaker directory
    const featureDir = getFeatureDir(projectPath, featureId);
    const featurePath = path.join(featureDir, "feature.json");

    try {
      const data = await fs.readFile(featurePath, "utf-8");
      const feature = JSON.parse(data);
      feature.status = status;
      feature.updatedAt = new Date().toISOString();
      // Set justFinishedAt timestamp when moving to waiting_approval (agent just completed)
      // Badge will show for 2 minutes after this timestamp
      if (status === "waiting_approval") {
        feature.justFinishedAt = new Date().toISOString();
      } else {
        // Clear the timestamp when moving to other statuses
        feature.justFinishedAt = undefined;
      }
      await fs.writeFile(featurePath, JSON.stringify(feature, null, 2));
    } catch {
      // Feature file may not exist
    }
  }

  /**
   * Extract a title from feature description (first line or truncated)
   */
  private extractTitleFromDescription(description: string): string {
    if (!description || !description.trim()) {
      return "Untitled Feature";
    }

    // Get first line, or first 60 characters if no newline
    const firstLine = description.split("\n")[0].trim();
    if (firstLine.length <= 60) {
      return firstLine;
    }

    // Truncate to 60 characters and add ellipsis
    return firstLine.substring(0, 57) + "...";
  }

  private buildFeaturePrompt(feature: Feature): string {
    const title = this.extractTitleFromDescription(feature.description);

    let prompt = `## Feature Implementation Task

**Feature ID:** ${feature.id}
**Title:** ${title}
**Description:** ${feature.description}
`;

    if (feature.spec) {
      prompt += `
**Specification:**
${feature.spec}
`;
    }

    // Add images note (like old implementation)
    if (feature.imagePaths && feature.imagePaths.length > 0) {
      const imagesList = feature.imagePaths
        .map((img, idx) => {
          const path = typeof img === "string" ? img : img.path;
          const filename =
            typeof img === "string"
              ? path.split("/").pop()
              : img.filename || path.split("/").pop();
          const mimeType =
            typeof img === "string" ? "image/*" : img.mimeType || "image/*";
          return `   ${
            idx + 1
          }. ${filename} (${mimeType})\n      Path: ${path}`;
        })
        .join("\n");

      prompt += `
**📎 Context Images Attached:**
The user has attached ${feature.imagePaths.length} image(s) for context. These images are provided both visually (in the initial message) and as files you can read:

${imagesList}

You can use the Read tool to view these images at any time during implementation. Review them carefully before implementing.
`;
    }

    prompt += `
## Instructions

Implement this feature by:
1. First, explore the codebase to understand the existing structure
2. Plan your implementation approach
3. Write the necessary code changes
4. Add or update tests as needed
5. Ensure the code follows existing patterns and conventions

When done, wrap your final summary in <summary> tags like this:

<summary>
## Summary: [Feature Title]

### Changes Implemented
- [List of changes made]

### Files Modified
- [List of files]

### Notes for Developer
- [Any important notes]
</summary>

This helps parse your summary correctly in the output logs.`;

    return prompt;
  }

  private async runAgent(
    workDir: string,
    featureId: string,
    prompt: string,
    abortController: AbortController,
    projectPath: string,
    imagePaths?: string[],
    model?: string,
    previousContent?: string
  ): Promise<void> {
    // CI/CD Mock Mode: Return early with mock response when AUTOMAKER_MOCK_AGENT is set
    // This prevents actual API calls during automated testing
    if (process.env.AUTOMAKER_MOCK_AGENT === "true") {
      console.log(
        `[AutoMode] MOCK MODE: Skipping real agent execution for feature ${featureId}`
      );

      // Simulate some work being done
      await this.sleep(500);

      // Emit mock progress events to simulate agent activity
      this.emitAutoModeEvent("auto_mode_progress", {
        featureId,
        content: "Mock agent: Analyzing the codebase...",
      });

      await this.sleep(300);

      this.emitAutoModeEvent("auto_mode_progress", {
        featureId,
        content: "Mock agent: Implementing the feature...",
      });

      await this.sleep(300);

      // Create a mock file with "yellow" content as requested in the test
      const mockFilePath = path.join(workDir, "yellow.txt");
      await fs.writeFile(mockFilePath, "yellow");

      this.emitAutoModeEvent("auto_mode_progress", {
        featureId,
        content: "Mock agent: Created yellow.txt file with content 'yellow'",
      });

      await this.sleep(200);

      // Save mock agent output
      const featureDirForOutput = getFeatureDir(projectPath, featureId);
      const outputPath = path.join(featureDirForOutput, "agent-output.md");

      const mockOutput = `# Mock Agent Output

## Summary
This is a mock agent response for CI/CD testing.

## Changes Made
- Created \`yellow.txt\` with content "yellow"

## Notes
This mock response was generated because AUTOMAKER_MOCK_AGENT=true was set.
`;

      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, mockOutput);

      console.log(
        `[AutoMode] MOCK MODE: Completed mock execution for feature ${featureId}`
      );
      return;
    }

    // Build SDK options using centralized configuration for feature implementation
    const sdkOptions = createAutoModeOptions({
      cwd: workDir,
      model: model,
      abortController,
    });

    // Extract model, maxTurns, and allowedTools from SDK options
    const finalModel = sdkOptions.model!;
    const maxTurns = sdkOptions.maxTurns;
    const allowedTools = sdkOptions.allowedTools as string[] | undefined;

    console.log(
      `[AutoMode] runAgent called for feature ${featureId} with model: ${finalModel}`
    );

    // Get provider for this model
    const provider = ProviderFactory.getProviderForModel(finalModel);

    console.log(
      `[AutoMode] Using provider "${provider.getName()}" for model "${finalModel}"`
    );

    // Build prompt content with images using utility
    const { content: promptContent } = await buildPromptWithImages(
      prompt,
      imagePaths,
      workDir,
      false // don't duplicate paths in text
    );

    const options: ExecuteOptions = {
      prompt: promptContent,
      model: finalModel,
      maxTurns: maxTurns,
      cwd: workDir,
      allowedTools: allowedTools,
      abortController,
    };

    // Execute via provider
    const stream = provider.executeQuery(options);
    // Initialize with previous content if this is a follow-up, with a separator
    let responseText = previousContent
      ? `${previousContent}\n\n---\n\n## Follow-up Session\n\n`
      : "";
    // Agent output goes to .automaker directory
    // Note: We use projectPath here, not workDir, because workDir might be a worktree path
    const featureDirForOutput = getFeatureDir(projectPath, featureId);
    const outputPath = path.join(featureDirForOutput, "agent-output.md");

    // Incremental file writing state
    let writeTimeout: ReturnType<typeof setTimeout> | null = null;
    const WRITE_DEBOUNCE_MS = 500; // Batch writes every 500ms

    // Helper to write current responseText to file
    const writeToFile = async (): Promise<void> => {
      try {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, responseText);
      } catch (error) {
        // Log but don't crash - file write errors shouldn't stop execution
        console.error(
          `[AutoMode] Failed to write agent output for ${featureId}:`,
          error
        );
      }
    };

    // Debounced write - schedules a write after WRITE_DEBOUNCE_MS
    const scheduleWrite = (): void => {
      if (writeTimeout) {
        clearTimeout(writeTimeout);
      }
      writeTimeout = setTimeout(() => {
        writeToFile();
      }, WRITE_DEBOUNCE_MS);
    };

    for await (const msg of stream) {
      if (msg.type === "assistant" && msg.message?.content) {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            // Add separator before new text if we already have content and it doesn't end with newlines
            if (responseText.length > 0 && !responseText.endsWith("\n\n")) {
              if (responseText.endsWith("\n")) {
                responseText += "\n";
              } else {
                responseText += "\n\n";
              }
            }
            responseText += block.text || "";

            // Check for authentication errors in the response
            if (
              block.text &&
              (block.text.includes("Invalid API key") ||
                block.text.includes("authentication_failed") ||
                block.text.includes("Fix external API key"))
            ) {
              throw new Error(
                "Authentication failed: Invalid or expired API key. " +
                  "Please check your ANTHROPIC_API_KEY or GOOGLE_API_KEY, or run 'claude login' to re-authenticate."
              );
            }

            // Schedule incremental file write (debounced)
            scheduleWrite();

            this.emitAutoModeEvent("auto_mode_progress", {
              featureId,
              content: block.text,
            });
          } else if (block.type === "tool_use") {
            // Emit event for real-time UI
            this.emitAutoModeEvent("auto_mode_tool", {
              featureId,
              tool: block.name,
              input: block.input,
            });

            // Also add to file output for persistence
            if (responseText.length > 0 && !responseText.endsWith("\n")) {
              responseText += "\n";
            }
            responseText += `\n🔧 Tool: ${block.name}\n`;
            if (block.input) {
              responseText += `Input: ${JSON.stringify(
                block.input,
                null,
                2
              )}\n`;
            }
            scheduleWrite();
          }
        }
      } else if (msg.type === "error") {
        // Handle error messages
        throw new Error(msg.error || "Unknown error");
      } else if (msg.type === "result" && msg.subtype === "success") {
        // Don't replace responseText - the accumulated content is the full history
        // The msg.result is just a summary which would lose all tool use details
        // Just ensure final write happens
        scheduleWrite();
      }
    }

    // Clear any pending timeout and do a final write to ensure all content is saved
    if (writeTimeout) {
      clearTimeout(writeTimeout);
    }
    // Final write - ensure all accumulated content is saved
    await writeToFile();
  }

  private async executeFeatureWithContext(
    projectPath: string,
    featureId: string,
    context: string,
    useWorktrees: boolean
  ): Promise<void> {
    if (this.runningFeatures.has(featureId)) {
      throw new Error("already running");
    }

    const abortController = new AbortController();
    // Add to running features immediately
    const tempRunningFeature: RunningFeature = {
      featureId,
      projectPath,
      worktreePath: null,
      branchName: null,
      abortController,
      isAutoMode: false,
      startTime: Date.now(),
    };
    this.runningFeatures.set(featureId, tempRunningFeature);

    try {
      // Emit feature start event early
      this.emitAutoModeEvent("auto_mode_feature_start", {
        featureId,
        projectPath,
        feature: {
          id: featureId,
          title: "Resuming...",
          description: "Feature is resuming from previous context",
        },
      });
      const feature = await this.loadFeature(projectPath, featureId);
      if (!feature) {
        throw new Error(`Feature ${featureId} not found`);
      }

      // Derive workDir from feature.branchName
      // If no branchName, derive from feature ID: feature/{featureId}
      let worktreePath: string | null = null;
      const branchName = feature.branchName || `feature/${featureId}`;

      if (useWorktrees && branchName) {
        worktreePath = await this.findExistingWorktreeForBranch(
          projectPath,
          branchName
        );
        if (!worktreePath) {
          worktreePath = await this.setupWorktree(
            projectPath,
            featureId,
            branchName
          );
        }
        console.log(
          `[AutoMode] Resuming in worktree for branch "${branchName}": ${worktreePath}`
        );
      }

      const workDir = worktreePath
        ? path.resolve(worktreePath)
        : path.resolve(projectPath);

      // Update running feature with actual worktree info
      tempRunningFeature.worktreePath = worktreePath;
      tempRunningFeature.branchName = branchName;

      // Update feature status to in_progress
      await this.updateFeatureStatus(projectPath, featureId, "in_progress");

      const prompt = `## Continuing Feature Implementation

${this.buildFeaturePrompt(feature)}

## Previous Context
The following is the output from a previous implementation attempt. Continue from where you left off:

${context}

## Instructions
Review the previous work and continue the implementation. If the feature appears complete, verify it works correctly.`;

      // Extract image paths from feature
      const imagePaths = feature.imagePaths?.map((img) =>
        typeof img === "string" ? img : img.path
      );

      // Get model from feature
      const model = resolveModelString(feature.model, DEFAULT_MODELS.claude);
      console.log(
        `[AutoMode] Resuming feature ${featureId} with model: ${model} in ${workDir}`
      );

      // Run the agent with context
      await this.runAgent(
        workDir,
        featureId,
        prompt,
        abortController,
        projectPath,
        imagePaths,
        model,
        context // Pass previous context for proper file output
      );

      // Mark as waiting_approval for user review
      await this.updateFeatureStatus(
        projectPath,
        featureId,
        "waiting_approval"
      );

      this.emitAutoModeEvent("auto_mode_feature_complete", {
        featureId,
        passes: true,
        message: `Feature resumed and completed in ${Math.round(
          (Date.now() - tempRunningFeature.startTime) / 1000
        )}s`,
        projectPath,
      });
    } catch (error) {
      const errorInfo = classifyError(error);

      if (errorInfo.isAbort) {
        this.emitAutoModeEvent("auto_mode_feature_complete", {
          featureId,
          passes: false,
          message: "Feature stopped by user",
          projectPath,
        });
      } else {
        console.error(`[AutoMode] Feature ${featureId} resume failed:`, error);
        await this.updateFeatureStatus(projectPath, featureId, "backlog");
        this.emitAutoModeEvent("auto_mode_error", {
          featureId,
          error: errorInfo.message,
          errorType: errorInfo.isAuth ? "authentication" : "execution",
          projectPath,
        });
      }
    } finally {
      this.runningFeatures.delete(featureId);
    }
  }

  /**
   * Emit an auto-mode event wrapped in the correct format for the client.
   * All auto-mode events are sent as type "auto-mode:event" with the actual
   * event type and data in the payload.
   */
  private emitAutoModeEvent(
    eventType: string,
    data: Record<string, unknown>
  ): void {
    // Wrap the event in auto-mode:event format expected by the client
    this.events.emit("auto-mode:event", {
      type: eventType,
      ...data,
    });
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(resolve, ms);

      // If signal is provided and already aborted, reject immediately
      if (signal?.aborted) {
        clearTimeout(timeout);
        reject(new Error("Aborted"));
        return;
      }

      // Listen for abort signal
      if (signal) {
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timeout);
            reject(new Error("Aborted"));
          },
          { once: true }
        );
      }
    });
  }
}
