import { useMemo } from 'react';
import type { NavigateOptions } from '@tanstack/react-router';
import { FileText, LayoutGrid, Bot, BookOpen, UserCircle, Terminal } from 'lucide-react';
import type { NavSection, NavItem } from '../types';
import type { KeyboardShortcut } from '@/hooks/use-keyboard-shortcuts';
import type { Project } from '@/lib/electron';

interface UseNavigationProps {
  shortcuts: {
    toggleSidebar: string;
    openProject: string;
    projectPicker: string;
    cyclePrevProject: string;
    cycleNextProject: string;
    spec: string;
    context: string;
    profiles: string;
    board: string;
    agent: string;
    terminal: string;
    settings: string;
  };
  hideSpecEditor: boolean;
  hideContext: boolean;
  hideTerminal: boolean;
  hideAiProfiles: boolean;
  currentProject: Project | null;
  projects: Project[];
  projectHistory: string[];
  navigate: (opts: NavigateOptions) => void;
  toggleSidebar: () => void;
  handleOpenFolder: () => void;
  setIsProjectPickerOpen: (value: boolean | ((prev: boolean) => boolean)) => void;
  cyclePrevProject: () => void;
  cycleNextProject: () => void;
}

export function useNavigation({
  shortcuts,
  hideSpecEditor,
  hideContext,
  hideTerminal,
  hideAiProfiles,
  currentProject,
  projects,
  projectHistory,
  navigate,
  toggleSidebar,
  handleOpenFolder,
  setIsProjectPickerOpen,
  cyclePrevProject,
  cycleNextProject,
}: UseNavigationProps) {
  // Build navigation sections
  const navSections: NavSection[] = useMemo(() => {
    const allToolsItems: NavItem[] = [
      {
        id: 'spec',
        label: 'Spec Editor',
        icon: FileText,
        shortcut: shortcuts.spec,
      },
      {
        id: 'context',
        label: 'Context',
        icon: BookOpen,
        shortcut: shortcuts.context,
      },
      {
        id: 'profiles',
        label: 'AI Profiles',
        icon: UserCircle,
        shortcut: shortcuts.profiles,
      },
    ];

    // Filter out hidden items
    const visibleToolsItems = allToolsItems.filter((item) => {
      if (item.id === 'spec' && hideSpecEditor) {
        return false;
      }
      if (item.id === 'context' && hideContext) {
        return false;
      }
      if (item.id === 'profiles' && hideAiProfiles) {
        return false;
      }
      return true;
    });

    // Build project items - Terminal is conditionally included
    const projectItems: NavItem[] = [
      {
        id: 'board',
        label: 'Kanban Board',
        icon: LayoutGrid,
        shortcut: shortcuts.board,
      },
      {
        id: 'agent',
        label: 'Agent Runner',
        icon: Bot,
        shortcut: shortcuts.agent,
      },
    ];

    // Add Terminal to Project section if not hidden
    if (!hideTerminal) {
      projectItems.push({
        id: 'terminal',
        label: 'Terminal',
        icon: Terminal,
        shortcut: shortcuts.terminal,
      });
    }

    return [
      {
        label: 'Project',
        items: projectItems,
      },
      {
        label: 'Tools',
        items: visibleToolsItems,
      },
    ];
  }, [shortcuts, hideSpecEditor, hideContext, hideTerminal, hideAiProfiles]);

  // Build keyboard shortcuts for navigation
  const navigationShortcuts: KeyboardShortcut[] = useMemo(() => {
    const shortcutsList: KeyboardShortcut[] = [];

    // Sidebar toggle shortcut - always available
    shortcutsList.push({
      key: shortcuts.toggleSidebar,
      action: () => toggleSidebar(),
      description: 'Toggle sidebar',
    });

    // Open project shortcut - opens the folder selection dialog directly
    shortcutsList.push({
      key: shortcuts.openProject,
      action: () => handleOpenFolder(),
      description: 'Open folder selection dialog',
    });

    // Project picker shortcut - only when we have projects
    if (projects.length > 0) {
      shortcutsList.push({
        key: shortcuts.projectPicker,
        action: () => setIsProjectPickerOpen((prev) => !prev),
        description: 'Toggle project picker',
      });
    }

    // Project cycling shortcuts - only when we have project history
    if (projectHistory.length > 1) {
      shortcutsList.push({
        key: shortcuts.cyclePrevProject,
        action: () => cyclePrevProject(),
        description: 'Cycle to previous project (MRU)',
      });
      shortcutsList.push({
        key: shortcuts.cycleNextProject,
        action: () => cycleNextProject(),
        description: 'Cycle to next project (LRU)',
      });
    }

    // Only enable nav shortcuts if there's a current project
    if (currentProject) {
      navSections.forEach((section) => {
        section.items.forEach((item) => {
          if (item.shortcut) {
            shortcutsList.push({
              key: item.shortcut,
              action: () => navigate({ to: `/${item.id}` as const }),
              description: `Navigate to ${item.label}`,
            });
          }
        });
      });

      // Add settings shortcut
      shortcutsList.push({
        key: shortcuts.settings,
        action: () => navigate({ to: '/settings' }),
        description: 'Navigate to Settings',
      });
    }

    return shortcutsList;
  }, [
    shortcuts,
    currentProject,
    navigate,
    toggleSidebar,
    projects.length,
    handleOpenFolder,
    projectHistory.length,
    cyclePrevProject,
    cycleNextProject,
    navSections,
    setIsProjectPickerOpen,
  ]);

  return {
    navSections,
    navigationShortcuts,
  };
}
