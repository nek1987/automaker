/**
 * GET / endpoint - Get all running agents
 */

import type { Request, Response } from 'express';
import type { AutoModeService } from '../../../services/auto-mode-service.js';
import { getBacklogPlanStatus, getRunningDetails } from '../../backlog-plan/common.js';
import path from 'path';
import { getErrorMessage, logError } from '../common.js';

export function createIndexHandler(autoModeService: AutoModeService) {
  return async (_req: Request, res: Response): Promise<void> => {
    try {
      const runningAgents = [...(await autoModeService.getRunningAgents())];
      const backlogPlanStatus = getBacklogPlanStatus();
      const backlogPlanDetails = getRunningDetails();

      if (backlogPlanStatus.isRunning && backlogPlanDetails) {
        runningAgents.push({
          featureId: `backlog-plan:${backlogPlanDetails.projectPath}`,
          projectPath: backlogPlanDetails.projectPath,
          projectName: path.basename(backlogPlanDetails.projectPath),
          isAutoMode: false,
          title: 'Backlog plan',
          description: backlogPlanDetails.prompt,
        });
      }

      res.json({
        success: true,
        runningAgents,
        totalCount: runningAgents.length,
      });
    } catch (error) {
      logError(error, 'Get running agents failed');
      res.status(500).json({ success: false, error: getErrorMessage(error) });
    }
  };
}
