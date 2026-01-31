import { File } from "lucide-react";

export const Loading = () => {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-background">
      <File className="w-16 h-16 text-primary mb-4 animate-pulse" />
      <h1 className="text-2xl md:text-4xl font-bold text-primary">
        cleanpdf.org
      </h1>
      <p className="text-lg text-muted-foreground animate-pulse">Loading</p>
    </div>
  );
};
