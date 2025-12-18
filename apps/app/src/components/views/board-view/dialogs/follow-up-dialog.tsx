"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { HotkeyButton } from "@/components/ui/hotkey-button";
import {
  DescriptionImageDropZone,
  FeatureImagePath as DescriptionImagePath,
  ImagePreviewMap,
} from "@/components/ui/description-image-dropzone";
import { MessageSquare } from "lucide-react";
import { Feature } from "@/store/app-store";

interface FollowUpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: Feature | null;
  prompt: string;
  imagePaths: DescriptionImagePath[];
  previewMap: ImagePreviewMap;
  onPromptChange: (prompt: string) => void;
  onImagePathsChange: (paths: DescriptionImagePath[]) => void;
  onPreviewMapChange: (map: ImagePreviewMap) => void;
  onSend: () => void;
  isMaximized: boolean;
}

export function FollowUpDialog({
  open,
  onOpenChange,
  feature,
  prompt,
  imagePaths,
  previewMap,
  onPromptChange,
  onImagePathsChange,
  onPreviewMapChange,
  onSend,
  isMaximized,
}: FollowUpDialogProps) {
  const handleClose = (open: boolean) => {
    if (!open) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        compact={!isMaximized}
        data-testid="follow-up-dialog"
        onKeyDown={(e: React.KeyboardEvent) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && prompt.trim()) {
            e.preventDefault();
            onSend();
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>Follow-Up Prompt</DialogTitle>
          <DialogDescription>
            Send additional instructions to continue working on this feature.
            {feature && (
              <span className="block mt-2 text-primary">
                Feature: {feature.description.slice(0, 100)}
                {feature.description.length > 100 ? "..." : ""}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4 overflow-y-auto flex-1 min-h-0">
          <div className="space-y-2">
            <Label htmlFor="follow-up-prompt">Instructions</Label>
            <DescriptionImageDropZone
              value={prompt}
              onChange={onPromptChange}
              images={imagePaths}
              onImagesChange={onImagePathsChange}
              placeholder="Describe what needs to be fixed or changed..."
              previewMap={previewMap}
              onPreviewMapChange={onPreviewMapChange}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            The agent will continue from where it left off, using the existing
            context. You can attach screenshots to help explain the issue.
          </p>
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => {
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <HotkeyButton
            onClick={onSend}
            disabled={!prompt.trim()}
            hotkey={{ key: "Enter", cmdCtrl: true }}
            hotkeyActive={open}
            data-testid="confirm-follow-up"
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Send Follow-Up
          </HotkeyButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
