"use client";

import { useEffect, useCallback } from "react";
import { useAppStore } from "@/store/app-store";

export interface KeyboardShortcut {
  key: string;
  action: () => void;
  description?: string;
}

/**
 * Check if the currently focused element is an input, textarea, or contenteditable element
 * or if an autocomplete/typeahead dropdown is open
 */
function isInputFocused(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;

  // Check if it's a form input element
  const tagName = activeElement.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }

  // Check if it's a contenteditable element
  if (activeElement.getAttribute("contenteditable") === "true") {
    return true;
  }

  // Check if it has a role of textbox or searchbox
  const role = activeElement.getAttribute("role");
  if (role === "textbox" || role === "searchbox" || role === "combobox") {
    return true;
  }

  // Check for autocomplete/typeahead dropdowns being open
  const autocompleteList = document.querySelector(
    '[data-testid="category-autocomplete-list"]'
  );
  if (autocompleteList) {
    return true;
  }

  // Check for any open dialogs
  const dialog = document.querySelector('[role="dialog"][data-state="open"]');
  if (dialog) {
    return true;
  }

  // Check for project picker dropdown being open
  const projectPickerDropdown = document.querySelector(
    '[data-testid="project-picker-dropdown"]'
  );
  if (projectPickerDropdown) {
    return true;
  }

  return false;
}

/**
 * Hook to manage keyboard shortcuts
 * Shortcuts won't fire when user is typing in inputs, textareas, or when dialogs are open
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs
      if (isInputFocused()) {
        return;
      }

      // Don't trigger if any modifier keys are pressed (except for specific combos we want)
      if (event.ctrlKey || event.altKey || event.metaKey) {
        return;
      }

      // Find matching shortcut
      const matchingShortcut = shortcuts.find(
        (shortcut) => shortcut.key.toLowerCase() === event.key.toLowerCase()
      );

      if (matchingShortcut) {
        event.preventDefault();
        matchingShortcut.action();
      }
    },
    [shortcuts]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}

/**
 * Hook to get current keyboard shortcuts from store
 * This replaces the static constants and allows customization
 */
export function useKeyboardShortcutsConfig() {
  const keyboardShortcuts = useAppStore((state) => state.keyboardShortcuts);
  return keyboardShortcuts;
}
