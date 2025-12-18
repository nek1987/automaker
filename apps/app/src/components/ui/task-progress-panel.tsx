"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { CheckCircle2, Circle, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { getElectronAPI } from "@/lib/electron";
import type { AutoModeEvent } from "@/types/electron";

interface TaskInfo {
  id: string;
  description: string;
  status: "pending" | "in_progress" | "completed";
  filePath?: string;
  phase?: string;
}

interface TaskProgressPanelProps {
  featureId: string;
  projectPath?: string;
  className?: string;
}

export function TaskProgressPanel({ featureId, projectPath, className }: TaskProgressPanelProps) {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [isExpanded, setIsExpanded] = useState(true);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load initial tasks from feature's planSpec
  const loadInitialTasks = useCallback(async () => {
    if (!projectPath) {
      setIsLoading(false);
      return;
    }

    try {
      const api = getElectronAPI();
      if (!api?.features) {
        setIsLoading(false);
        return;
      }

      const result = await api.features.get(projectPath, featureId);
      if (result.success && result.feature?.planSpec?.tasks) {
        const planTasks = result.feature.planSpec.tasks;
        const currentId = result.feature.planSpec.currentTaskId;
        const completedCount = result.feature.planSpec.tasksCompleted || 0;

        // Convert planSpec tasks to TaskInfo with proper status
        const initialTasks: TaskInfo[] = planTasks.map((t: any, index: number) => ({
          id: t.id,
          description: t.description,
          filePath: t.filePath,
          phase: t.phase,
          status: index < completedCount
            ? "completed" as const
            : t.id === currentId
              ? "in_progress" as const
              : "pending" as const,
        }));

        setTasks(initialTasks);
        setCurrentTaskId(currentId || null);
      }
    } catch (error) {
      console.error("Failed to load initial tasks:", error);
    } finally {
      setIsLoading(false);
    }
  }, [featureId, projectPath]);

  // Load initial state on mount
  useEffect(() => {
    loadInitialTasks();
  }, [loadInitialTasks]);

  // Listen to task events for real-time updates
  useEffect(() => {
    const api = getElectronAPI();
    if (!api?.autoMode) return;

    const unsubscribe = api.autoMode.onEvent((event: AutoModeEvent) => {
      // Only handle events for this feature
      if (!("featureId" in event) || event.featureId !== featureId) return;

      switch (event.type) {
        case "auto_mode_task_started":
          if ("taskId" in event && "taskDescription" in event) {
            const taskEvent = event as Extract<AutoModeEvent, { type: "auto_mode_task_started" }>;
            setCurrentTaskId(taskEvent.taskId);

            setTasks((prev) => {
              // Check if task already exists
              const existing = prev.find((t) => t.id === taskEvent.taskId);
              if (existing) {
                // Update status to in_progress
                return prev.map((t) =>
                  t.id === taskEvent.taskId ? { ...t, status: "in_progress" as const } : t
                );
              }
              // Add new task
              return [
                ...prev,
                {
                  id: taskEvent.taskId,
                  description: taskEvent.taskDescription,
                  status: "in_progress" as const,
                },
              ];
            });
          }
          break;

        case "auto_mode_task_complete":
          if ("taskId" in event) {
            const taskEvent = event as Extract<AutoModeEvent, { type: "auto_mode_task_complete" }>;
            setTasks((prev) =>
              prev.map((t) =>
                t.id === taskEvent.taskId ? { ...t, status: "completed" as const } : t
              )
            );
            setCurrentTaskId(null);
          }
          break;
      }
    });

    return unsubscribe;
  }, [featureId]);

  // Calculate progress
  const completedCount = tasks.filter((t) => t.status === "completed").length;
  const totalCount = tasks.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Don't render if loading or no tasks
  if (isLoading) {
    return null;
  }

  if (tasks.length === 0) {
    return null;
  }

  return (
    <div className={cn("border rounded-lg bg-muted/30", className)}>
      {/* Header with progress */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="font-medium text-sm">Task Progress</span>
          <span className="text-xs text-muted-foreground">
            ({completedCount}/{totalCount})
          </span>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-8">{progressPercent}%</span>
        </div>
      </button>

      {/* Task list */}
      {isExpanded && (
        <div className="border-t px-3 py-2 space-y-1 max-h-48 overflow-y-auto">
          {tasks.map((task) => (
            <div
              key={task.id}
              className={cn(
                "flex items-start gap-2 py-1.5 px-2 rounded text-sm",
                task.status === "in_progress" && "bg-primary/10 border border-primary/20",
                task.status === "completed" && "text-muted-foreground"
              )}
            >
              {/* Status icon */}
              {task.status === "completed" ? (
                <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              ) : task.status === "in_progress" ? (
                <Loader2 className="h-4 w-4 text-primary animate-spin mt-0.5 flex-shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              )}

              {/* Task info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "font-mono text-xs px-1 py-0.5 rounded",
                      task.status === "in_progress"
                        ? "bg-primary/20 text-primary"
                        : task.status === "completed"
                        ? "bg-green-500/20 text-green-600 dark:text-green-400"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {task.id}
                  </span>
                  <span
                    className={cn(
                      "truncate",
                      task.status === "in_progress" && "font-medium"
                    )}
                  >
                    {task.description}
                  </span>
                </div>
                {task.filePath && (
                  <span className="text-xs text-muted-foreground font-mono truncate block">
                    {task.filePath}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
