import { useState, useCallback, useRef } from "react";
import {
  Upload,
  FileText,
  Download,
  X,
  Circle,
  Check,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import confetti from "canvas-confetti";
import { ProcessingAnimation } from "./ProcessingAnimation";
import posthog from "posthog-js";

export const PDFUploader = () => {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [cleanedPdfUrls, setCleanedPdfUrls] = useState<
    { name: string; url: string; itemsRemoved?: string[] }[]
  >([]);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cleaningOptions = {
    removeLinks: true,
    removeForms: true,
    removeJavascript: true,
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const addMoreFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []).filter(
      (file) => file.type === "application/pdf"
    );

    if (selectedFiles.length > 0) {
      setFiles((prev) => {
        // Filter out duplicates based on name and size
        const newFiles = selectedFiles.filter(
          (newFile) => !prev.some(
            (existingFile) => existingFile.name === newFile.name && existingFile.size === newFile.size
          )
        );

        if (newFiles.length === 0) {
          toast.info("All selected files are already in the list");
          return prev;
        }

        if (newFiles.length < selectedFiles.length) {
          const duplicateCount = selectedFiles.length - newFiles.length;
          toast.info(`${duplicateCount} duplicate file${duplicateCount > 1 ? 's were' : ' was'} skipped`);
        }

        setCleanedPdfUrls([]);
        return [...prev, ...newFiles];
      });
    }
    // Reset the input so the same files can be selected again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (file) => file.type === "application/pdf"
    );
    if (droppedFiles.length > 0) {
      setFiles(droppedFiles);
      setCleanedPdfUrls([]);
    } else {
      toast.error("Please upload PDF files");
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []).filter(
      (file) => file.type === "application/pdf"
    );
    if (selectedFiles.length > 0) {
      setFiles(selectedFiles);
      setCleanedPdfUrls([]);
    } else {
      toast.error("Please upload PDF files");
    }
  };

  const processPDF = async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setProgress(0);
    try {
      const workerPromises = files.map((file) => {
        return new Promise<{ name: string; url: string; itemsRemoved?: string[] }>((resolve, reject) => {
          const worker = new Worker(
            new URL("../workers/pdf.worker.ts?worker", import.meta.url)
          );
          worker.onmessage = (
            e: MessageEvent<{ success: boolean; blob?: Blob; error?: string; itemsRemoved?: string[] }>
          ) => {
            if (e.data.success && e.data.blob) {
              const url = URL.createObjectURL(e.data.blob);
              resolve({ name: file.name, url, itemsRemoved: e.data.itemsRemoved });
            } else {
              reject(new Error(e.data.error || "Unknown worker error"));
            }
            worker.terminate();
            setProgress((prev) => prev + 100 / files.length);
          };
          worker.onerror = (e) => {
            reject(e);
            worker.terminate();
          };
          worker.postMessage({ file, options: cleaningOptions });
        });
      });

      const results = await Promise.all(workerPromises);
      setCleanedPdfUrls(results);

      // Trigger confetti
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });

      toast.success(
        `${files.length} PDF${
          files.length > 1 ? "s" : ""
        } cleaned successfully!`
      );
      posthog.capture("cleanpdf-success", { count: files.length });
    } catch (error) {
      console.error("Error processing PDF:", error);
      posthog.capture("cleanpdf-error", { error: error.message });

      toast.error("Failed to process PDF. Please try again.");
    } finally {
      setProcessing(false);
      setProgress(0);
    }
  };

  const downloadPDF = (pdfUrl: string, fileName: string) => {
    const link = document.createElement("a");
    link.href = pdfUrl;
    link.download = `cleaned_${fileName}`;
    link.click();
  };

  const downloadAll = () => {
    cleanedPdfUrls.forEach(({ url, name }) => {
      setTimeout(() => downloadPDF(url, name), 100);
    });
  };

  const reset = () => {
    setFiles([]);
    setCleanedPdfUrls([]);
    cleanedPdfUrls.forEach(({ url }) => URL.revokeObjectURL(url));
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {files.length === 0 ? (
        <Card
          className={`border-2 border-dashed transition-all duration-300 ${
            isDragging
              ? "border-primary bg-primary/5 scale-[1.02]"
              : "border-border hover:border-primary/50"
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <label htmlFor="pdf-upload" className="flex flex-col items-center justify-center p-12 cursor-pointer">
            <Upload className="w-16 h-16 text-primary mb-4" aria-hidden="true" />
            <h3 className="text-2xl font-semibold mb-2">Drop your PDFs here</h3>
            <p className="text-muted-foreground text-sm mb-2 mt-2">
              or click to browse (multiple files)
            </p>

            <Button type="button" asChild>
              <span>Select PDFs</span>
            </Button>
            <input
              id="pdf-upload"
              type="file"
              accept="application/pdf"
              multiple
              className="hidden"
              onChange={handleFileSelect}
            />
          </label>
        </Card>
      ) : (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">
              {files.length} PDF{files.length > 1 ? "s" : ""} selected
            </h3>
            {!processing && (
              <Button
                variant="ghost"
                size="sm"
                onClick={reset}
                className="h-8 w-8 p-0"
                title={cleanedPdfUrls.length > 0 ? "Start over" : "Clear selection"}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>

          {processing && <ProcessingAnimation progress={progress} />}

          <div className="max-h-96 overflow-y-auto">
            <div className="flex flex-row flex-wrap gap-2">
              {files.map((file, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2 p-2 bg-muted/50 rounded relative group text-left"
                  style={{ width: 'calc(33.333% - 0.5rem)', minWidth: '150px' }}
                >
                  <FileText className="w-4 h-4 text-primary flex-shrink-0" aria-hidden="true" />
                  <div className="flex-1 min-w-0 pr-6">
                    <p className="text-sm truncate" title={file.name}>{file.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {file.size < 1024 * 1024
                        ? `${(file.size / 1024).toFixed(1)} KB`
                        : `${(file.size / 1024 / 1024).toFixed(2)} MB`
                      }
                    </p>
                  </div>
                  {!processing && cleanedPdfUrls.length === 0 && (
                    <button
                      onClick={() => removeFile(index)}
                      className="absolute top-1 right-1 h-6 w-6 flex items-center justify-center rounded hover:bg-muted-foreground/20 transition-colors"
                      title="Remove file"
                    >
                      <X className="h-3 w-3 text-muted-foreground" />
                    </button>
                  )}
                </div>
              ))}
              {!processing && cleanedPdfUrls.length === 0 && (
                <label
                  style={{ width: 'calc(33.333% - 0.5rem)', minWidth: '150px' }}
                  className="flex items-center justify-center p-2 border-2 border-dashed border-border rounded hover:border-primary/50 transition-colors cursor-pointer group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    multiple
                    className="hidden"
                    onChange={addMoreFiles}
                  />
                  <Plus className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-sm text-muted-foreground group-hover:text-primary transition-colors">
                    Add more
                  </span>
                </label>
              )}
            </div>
          </div>

          {!processing && cleanedPdfUrls.length === 0 ? (
            <Button onClick={processPDF} className="w-full" size="lg">
              Clean PDF{files.length > 1 ? "s" : ""}
            </Button>
          ) : (
            !processing && (
              <div className="space-y-3">
                <div className="flex items-center justify-center p-4 bg-muted-50 rounded-lg">
                  <div className="relative">
                    <Circle className="w-12 h-12 text-emerald-400 fill-emerald-400" aria-hidden="true" />
                    <Check className="w-6 h-6 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" strokeWidth={4} />
                  </div>
                  <p className="text-sm font-medium text-center text-emerald-400 ml-4">
                    Done! {cleanedPdfUrls.length} PDF{cleanedPdfUrls.length > 1 ? "s" : ""} cleaned.
                  </p>
                </div>

                {cleanedPdfUrls.length > 1 && (
                  <Button onClick={downloadAll} className="w-full" size="lg">
                    <Download className="w-4 h-4 mr-2" aria-hidden="true" />
                    Download All ({cleanedPdfUrls.length} PDFs)
                  </Button>
                )}

                {/* Show items removed for each PDF */}
                {cleanedPdfUrls.map(({ url, name, itemsRemoved }, index) => {
                  const file = files[index];
                  return (
                    <Card key={index} className="p-4 relative text-left">
                      <div className="flex items-start gap-3 pr-10">
                        {/* File icon */}
                        <div className="flex-shrink-0">
                          <FileText className="w-5 h-5 text-primary" aria-hidden="true" />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 text-left">
                          {/* Filename */}
                          <p className="text-sm font-medium truncate text-left">{name}</p>

                          {/* File size */}
                          {file && (
                            <p className="text-xs text-muted-foreground text-left">
                              {file.size < 1024 * 1024
                                ? `${(file.size / 1024).toFixed(1)} KB`
                                : `${(file.size / 1024 / 1024).toFixed(2)} MB`
                              }
                            </p>
                          )}

                          {/* Actions list or clean message */}
                          <div className="pt-1 text-left">
                            {itemsRemoved && itemsRemoved.length > 0 ? (
                              <ul className="text-xs space-y-1 text-left">
                                {itemsRemoved.slice(0, 10).map((item, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-emerald-600 dark:text-emerald-400 text-left">
                                    <Check className="w-3 h-3 flex-shrink-0 mt-0.5" strokeWidth={3} />
                                    <span>{item}</span>
                                  </li>
                                ))}
                                {itemsRemoved.length > 10 && (
                                  <li className="text-muted-foreground italic pl-4 text-left">
                                    ...and {itemsRemoved.length - 10} more
                                  </li>
                                )}
                              </ul>
                            ) : (
                              <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-left">
                                <Check className="w-3 h-3" strokeWidth={3} />
                                <span className="text-xs">No malicious content found</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Download button */}
                      <button
                        onClick={() => downloadPDF(url, name)}
                        className="absolute top-4 right-4 h-8 w-8 flex items-center justify-center rounded hover:bg-muted transition-colors"
                        title="Download cleaned PDF"
                      >
                        <Download className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </Card>
                  );
                })}
              </div>
            )
          )}
        </Card>
      )}
    </div>
  );
};
