import { PDFUploader } from "@/components/PDFUploader";
import { ThemeToggle } from "@/components/ThemeToggle";
import { File, CloudOff, Lock, Github } from "lucide-react";

const Index = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-secondary/30">
      <div className="fixed top-4 right-4 flex items-center gap-2 z-50">
        <a
          href="https://github.com/toxdes/cleanpdf-org"
          target="_blank"
          rel="noopener noreferrer"
          className="p-2 rounded-lg bg-card border border-border/50 hover:border-primary/50 transition-all hover:bg-primary/10"
          aria-label="View source on GitHub"
        >
          <Github className="w-5 h-5" />
        </a>
        <ThemeToggle />
      </div>
      <div className="container mx-auto px-4 py-12 md:py-16">
        {/* Hero Section */}
        <div className="text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary shadow-lg">
            <File
              className="w-8 h-8 text-primary-foreground"
              aria-hidden="true"
            />
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-primary">
            cleanpdf.org
          </h1>
          <p className="text-lg md:text-xl text-foreground max-w-2xl mx-auto">
            Remove links, annotations, JavaScript, and malicious content from your PDFs instantly.
          </p>
          <p className="text-sm md:text-md text-muted-foreground max-w-2xl mx-auto">
            All processing happens in your browser. Your files never leave your device.
          </p>
        </div>

        {/* Main Upload Section */}
        <div className="text-center mt-4 md:mt-8 space-y-4">
          <PDFUploader />
        </div>
        <div className="text-center mt-4 md:mt-8 space-y-4">
          <p className="text-xs md:text-md text-muted-foreground max-w-2xl mx-auto">
            This web app is open-source. For bug reports and feature suggestions,{" "}
            <a
              href="https://github.com/toxdes/cleanpdf-org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
            >
              open an issue on GitHub
            </a>
            .
          </p>
        </div>
        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4 md:mt-8 max-w-4xl mx-auto">
          <div className="text-center space-y-3 p-6 rounded-xl bg-card border border-border/50 hover:border-primary/50 transition-all">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
              <File className="w-6 h-6 text-primary" aria-hidden="true" />
            </div>
            <h2 className="font-semibold">Clean & Simple</h2>
            <p className="text-sm text-muted-foreground">
              Removes links, annotations, JavaScript, and malicious content automatically.
            </p>
          </div>

          <div className="text-center space-y-3 p-6 rounded-xl bg-card border border-border/50 hover:border-primary/50 transition-all">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
              <Lock className="w-6 h-6 text-primary" aria-hidden="true" />
            </div>
            <h2 className="font-semibold">100% Private</h2>
            <p className="text-sm text-muted-foreground">
              All processing happens in your browser. Your files never leave
              your device.
            </p>
          </div>

          <div className="text-center space-y-3 p-6 rounded-xl bg-card border border-border/50 hover:border-primary/50 transition-all">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
              <CloudOff className="w-6 h-6 text-primary" aria-hidden="true" />
            </div>
            <h2 className="font-semibold">Works Offline</h2>
            <p className="text-sm text-muted-foreground">
              Once loaded, this site works completely offline, even without internet.
            </p>
          </div>
        </div>
        <footer className="mt-4 text-center text-xs text-muted-foreground">
          <p>
            &copy; {new Date().getFullYear()} cleanpdf.org. All rights reserved.
          </p>
        </footer>
      </div>
    </div>
  );
};

export default Index;
