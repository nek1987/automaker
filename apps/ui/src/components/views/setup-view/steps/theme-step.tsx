import { Button } from "@/components/ui/button";
import { ArrowRight, ArrowLeft, Check } from "lucide-react";
import { themeOptions } from "@/config/theme-options";
import { useAppStore } from "@/store/app-store";
import { cn } from "@/lib/utils";

interface ThemeStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function ThemeStep({ onNext, onBack }: ThemeStepProps) {
  const { theme, setTheme, setPreviewTheme } = useAppStore();

  const handleThemeHover = (themeValue: string) => {
    setPreviewTheme(themeValue as typeof theme);
  };

  const handleThemeLeave = () => {
    setPreviewTheme(null);
  };

  const handleThemeClick = (themeValue: string) => {
    setTheme(themeValue as typeof theme);
    setPreviewTheme(null);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-foreground mb-3">
          Choose Your Theme
        </h2>
        <p className="text-muted-foreground max-w-md mx-auto">
          Pick a theme that suits your style. Hover to preview, click to select.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {themeOptions.map((option) => {
          const Icon = option.Icon;
          const isSelected = theme === option.value;

          return (
            <button
              key={option.value}
              data-testid={option.testId}
              onMouseEnter={() => handleThemeHover(option.value)}
              onMouseLeave={handleThemeLeave}
              onClick={() => handleThemeClick(option.value)}
              className={cn(
                "relative flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all duration-200",
                "hover:scale-105 hover:shadow-lg",
                isSelected
                  ? "border-brand-500 bg-brand-500/10"
                  : "border-border hover:border-brand-400 bg-card"
              )}
            >
              {isSelected && (
                <div className="absolute top-2 right-2">
                  <Check className="w-4 h-4 text-brand-500" />
                </div>
              )}
              <Icon className="w-6 h-6 text-foreground" />
              <span className="text-sm font-medium text-foreground">
                {option.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <Button
          size="lg"
          className="bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white"
          onClick={onNext}
          data-testid="theme-continue-button"
        >
          Continue
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
