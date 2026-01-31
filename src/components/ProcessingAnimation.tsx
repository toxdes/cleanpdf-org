import { Progress } from "@/components/ui/progress";
import { Check, Loader2 } from "lucide-react";

interface ProcessingAnimationProps {
  progress: number;
}

export const ProcessingAnimation = ({ progress }: ProcessingAnimationProps) => {
  const isComplete = progress >= 100;

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center justify-center py-8">
        {/* Icon */}
        <div className="relative w-24 h-24 mb-4">
          <div className="absolute inset-0 border-4 border-muted rounded-full"></div>
          {isComplete ? (
            <>
              <div className="absolute inset-2 border-4 border-emerald-400 rounded-full"></div>
              <Check className="absolute inset-0 m-auto w-12 h-12 text-emerald-400" strokeWidth={3} />
            </>
          ) : (
            <>
              <div className="absolute inset-0 border-4 border-primary/30 rounded-full border-t-primary animate-spin"></div>
              <Loader2 className="absolute inset-0 m-auto w-12 h-12 text-primary animate-spin" strokeWidth={2} />
            </>
          )}
        </div>

        {/* Text */}
        <p className="text-lg font-medium text-muted-foreground mb-4">
          {isComplete ? "Complete!" : "Processing..."}
        </p>

        {/* Dots Animation */}
        {!isComplete && (
          <div className="flex space-x-2">
            <div className="w-3 h-3 bg-primary rounded-full animate-wave" style={{ animationDelay: "0s" }} />
            <div className="w-3 h-3 bg-primary rounded-full animate-wave" style={{ animationDelay: "0.1s" }} />
            <div className="w-3 h-3 bg-primary rounded-full animate-wave" style={{ animationDelay: "0.2s" }} />
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>{isComplete ? "Processing complete!" : "Processing PDFs..."}</span>
          <span>{Math.round(progress)}%</span>
        </div>
        <Progress value={progress} className="h-2" aria-label="PDF cleaning progress" />
      </div>
    </div>
  );
};