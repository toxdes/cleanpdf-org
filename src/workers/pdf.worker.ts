import * as pdfLib from "pdf-lib";

interface CleaningOptions {
  removeLinks: boolean;
  removeForms: boolean;
  removeJavascript: boolean;
}

interface CleanResult {
  success: boolean;
  blob?: Blob;
  error?: string;
  itemsRemoved?: string[];
  warning?: string;
}

// Helper: Check if value is a PDFRef by checking tag property
function isPDFRef(value: unknown): value is pdfLib.PDFRef {
  return value !== null && value !== undefined &&
         typeof value === 'object' &&
         'tag' in value &&
         (value as any).tag === 'PDFRef';
}

// Helper: Check if value is a PDFDict
function isPDFDict(value: unknown): value is pdfLib.PDFDict {
  return value instanceof pdfLib.PDFDict;
}

// Helper: Check if value is a PDFArray
function isPDFArray(value: unknown): value is pdfLib.PDFArray {
  return value instanceof pdfLib.PDFArray;
}

// Helper: Safely get an object from context
function safeLookup(context: pdfLib.PDFContext, ref: pdfLib.PDFRef): pdfLib.PDFObject | undefined {
  try {
    return context.lookup(ref);
  } catch {
    return undefined;
  }
}

// =============================================================================
// SAFE BYTE-LEVEL PDF CLEANER
// Works directly with bytes to preserve PDF structure (xref, lengths, offsets)
// =============================================================================

interface StreamRange {
  start: number;
  end: number;
  subtype?: string;  // Track stream subtype for special handling
}

// Find all stream...endstream blocks to protect binary data
// But identify XFA and metadata streams for special handling
function findProtectedStreams(pdfBytes: Uint8Array): StreamRange[] {
  const ranges: StreamRange[] = [];
  const pdfStr = Array.from(pdfBytes).map(b => String.fromCharCode(b)).join('');

  // Find stream markers - use regex to find boundaries
  const streamPattern = /stream\s*\r?\n/g;
  const endstreamPattern = /endstream/g;

  let streamMatch;
  const streamStarts: number[] = [];

  // Find all stream keyword positions
  while ((streamMatch = streamPattern.exec(pdfStr)) !== null) {
    streamStarts.push(streamMatch.index + streamMatch[0].length);
  }

  // For each stream, find its matching endstream
  for (const streamStart of streamStarts) {
    endstreamPattern.lastIndex = streamStart;
    const endMatch = endstreamPattern.exec(pdfStr);
    if (endMatch) {
      // Check if this is an XFA or Metadata stream by looking back
      const beforeStream = pdfStr.substring(Math.max(0, streamStart - 500), streamStart);
      const isXFA = beforeStream.includes('/Subtype /XML') ||
                    beforeStream.includes('/XFA') ||
                    beforeStream.includes('/AcroForm');
      const isMetadata = beforeStream.includes('/Type /Metadata') ||
                        beforeStream.includes('/Metadata');

      // Also check if stream content starts with XML markers
      // Look at first 500 chars of stream content (increased from 100)
      const streamContentStart = pdfStr.substring(streamStart, Math.min(streamStart + 500, endMatch.index));
      const contentStartsWithXML = streamContentStart.trim().startsWith('<?xml') ||
                                   streamContentStart.trim().startsWith('<xdp:xdp') ||
                                   streamContentStart.trim().startsWith('<template') ||
                                   streamContentStart.includes('<x:xmpmeta') ||
                                   streamContentStart.includes('<rdf:RDF');

      ranges.push({
        start: streamStart,
        end: endMatch.index,
        subtype: (isXFA || contentStartsWithXML) ? 'XML' : isMetadata ? 'Metadata' : undefined
      });
    }
  }

  return ranges;
}

// Check if a position is inside any protected range
// XML and Metadata streams are NOT protected (they contain text that needs cleaning)
function isProtected(pos: number, ranges: StreamRange[]): boolean {
  return ranges.some(r => pos >= r.start && pos < r.end && !r.subtype);
}

// Convert bytes to string for regex, preserving byte offsets
function bytesToString(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => String.fromCharCode(b & 0xFF)).join('');
}

// Convert string back to bytes (Latin-1 to preserve 1:1 mapping)
function stringToBytes(str: string): Uint8Array {
  return new Uint8Array(Array.from(str).map(c => c.charCodeAt(0) & 0xFF));
}

// Fallback: Clean PDF at byte level while preserving structure
function cleanPDFBytes(pdfBytes: Uint8Array, options: CleaningOptions): {
  cleaned: Uint8Array;
  itemsRemoved: string[];
  warning?: string;
} {
  const itemsRemoved: string[] = [];
  const warnings: string[] = [];

  console.log('[DEBUG] Using safe byte-level fallback cleaning');

  // Find streams to protect binary data
  const protectedRanges = findProtectedStreams(pdfBytes);
  const protectedCount = protectedRanges.filter(r => !r.subtype).length;
  console.log(`[DEBUG] Found ${protectedRanges.length} streams, ${protectedCount} protected (${protectedRanges.length - protectedCount} XML/Metadata streams will be cleaned)`);

  // Work on a copy
  const cleaned = new Uint8Array(pdfBytes);
  const pdfStr = bytesToString(cleaned);

  // ===== STEP 1: Remove /OpenAction (whole entry removal - safe) =====
  const openActionPattern = /\/OpenAction\s*(<<[^>]*>>|\d+\s+\d+\s+R)/g;
  let match;
  openActionPattern.lastIndex = 0;
  while ((match = openActionPattern.exec(pdfStr)) !== null) {
    if (!isProtected(match.index, protectedRanges)) {
      // Remove by replacing with spaces (same length)
      for (let i = 0; i < match[0].length; i++) {
        cleaned[match.index + i] = 32; // space
      }
      itemsRemoved.push('Removed OpenAction (byte-level)');
      console.log('[DEBUG] Byte-level: Removed OpenAction');
    }
  }

  // ===== STEP 2: Remove /AA (Additional Actions) - safe =====
  if (options.removeJavascript || options.removeLinks) {
    const aaPattern = /\/AA\s*<<[^>]*>>/g;
    aaPattern.lastIndex = 0;
    while ((match = aaPattern.exec(pdfStr)) !== null) {
      if (!isProtected(match.index, protectedRanges)) {
        for (let i = 0; i < match[0].length; i++) {
          cleaned[match.index + i] = 32;
        }
        itemsRemoved.push('Removed Additional Actions (byte-level)');
        console.log('[DEBUG] Byte-level: Removed AA');
      }
    }
  }

  // ===== STEP 3: Remove /Names/JavaScript =====
  if (options.removeJavascript) {
    const namesJsPattern = /\/Names\s*<<[^>]*\/JavaScript\s*<<[^>]*>>/g;
    namesJsPattern.lastIndex = 0;
    while ((match = namesJsPattern.exec(pdfStr)) !== null) {
      if (!isProtected(match.index, protectedRanges)) {
        // Replace with minimal safe value
        const replacement = '/Names<<>>';
        for (let i = 0; i < replacement.length; i++) {
          cleaned[match.index + i] = replacement.charCodeAt(i);
        }
        // Fill rest with spaces
        for (let i = replacement.length; i < match[0].length; i++) {
          cleaned[match.index + i] = 32;
        }
        itemsRemoved.push('Removed JavaScript name tree (byte-level)');
        console.log('[DEBUG] Byte-level: Removed Names/JavaScript');
      }
    }
  }

  // ===== STEP 4: Remove /XFA forms =====
  if (options.removeForms) {
    const xfaPattern = /\/XFA\s*\d+\s+\d+\s+R/g;
    xfaPattern.lastIndex = 0;
    while ((match = xfaPattern.exec(pdfStr)) !== null) {
      if (!isProtected(match.index, protectedRanges)) {
        for (let i = 0; i < match[0].length; i++) {
          cleaned[match.index + i] = 32;
        }
        itemsRemoved.push('Removed XFA form reference (byte-level)');
        console.log('[DEBUG] Byte-level: Removed XFA');
      }
    }

    // Clean XFA XML URLs (in XML content, not PDF streams)
    const xfaUrlPatterns = [
      /<submit[^>]*target\s*=\s*["'][^"']*http[^"']*["'][^>]*>/gi,
      /<submit[^>]*href\s*=\s*["'][^"']*http[^"']*["'][^>]*>/gi,
      /<xdp:submit[^>]*target\s*=\s*["'][^"']*http[^"']*["'][^>]*>/gi,
      /<xdp:submit[^>]*href\s*=\s*["'][^"']*http[^"']*["'][^>]*>/gi,
    ];

    for (const pattern of xfaUrlPatterns) {
      pattern.lastIndex = 0;
      while ((match = pattern.exec(pdfStr)) !== null) {
        if (!isProtected(match.index, protectedRanges)) {
          // Replace URL with about:blank (preserve length)
          const cleanedTag = match[0].replace(/https?:\/\/[^\s"'>]+/gi, (url) => {
            // Pad to same length
            let replacement = 'about:blank';
            while (replacement.length < url.length) {
              replacement += ' ';
            }
            return replacement.substring(0, url.length);
          });
          for (let i = 0; i < cleanedTag.length; i++) {
            cleaned[match.index + i] = cleanedTag.charCodeAt(i);
          }
          itemsRemoved.push('Removed XFA URL (byte-level)');
          console.log('[DEBUG] Byte-level: Removed XFA URL');
        }
      }
    }

    // Remove submit tags entirely (same-length with spaces)
    // Use [\s\S]*? instead of [^>]* to match multi-line tags
    const submitTagPatterns = [
      /<submit[\s\S]*?>/gi,
      /<\/submit>/gi,
      /<xdp:submit[\s\S]*?>/gi,
      /<\/xdp:submit>/gi,
    ];

    for (const pattern of submitTagPatterns) {
      pattern.lastIndex = 0;
      while ((match = pattern.exec(pdfStr)) !== null) {
        if (!isProtected(match.index, protectedRanges)) {
          for (let i = 0; i < match[0].length; i++) {
            cleaned[match.index + i] = 32;
          }
          itemsRemoved.push('Removed XDP submit tag (byte-level)');
          console.log('[DEBUG] Byte-level: Removed submit tag');
        }
      }
    }

    // Clean XML stylesheet href with UNC paths (test4.pdf)
    const stylesheetPattern = /<\?xml-stylesheet[^>]*href\s*=\s*["'][^"']*["'][^>]*\?>/gi;
    stylesheetPattern.lastIndex = 0;
    while ((match = stylesheetPattern.exec(pdfStr)) !== null) {
      if (!isProtected(match.index, protectedRanges)) {
        for (let i = 0; i < match[0].length; i++) {
          cleaned[match.index + i] = 32;
        }
        itemsRemoved.push('Removed XML stylesheet (byte-level)');
        console.log('[DEBUG] Byte-level: Removed xml-stylesheet');
      }
    }
  }

  // ===== STEP 5: Neutralize malicious action types =====
  const actionTypes = options.removeLinks
    ? ['/URI', '/Launch', '/GoToR', '/GoToE', '/SubmitForm', '/ImportData', '/JavaScript']
    : ['/JavaScript'];

  for (const actionType of actionTypes) {
    // Change /S /ActionType to /S /Next (same length!)
    const actionPattern = new RegExp(
      `(\\/S\\s+)${actionType.replace('/', '\\/')}`,
      'g'
    );
    actionPattern.lastIndex = 0;
    while ((match = actionPattern.exec(pdfStr)) !== null) {
      if (!isProtected(match.index, protectedRanges)) {
        // /S /URI -> /S /Next (same length: /URI = 4 chars, /Next = 5 chars, need to pad)
        const prefix = match[1];
        const replacement = prefix + '/Next ';
        for (let i = 0; i < match[0].length; i++) {
          if (i < replacement.length) {
            cleaned[match.index + i] = replacement.charCodeAt(i);
          } else {
            cleaned[match.index + i] = 32; // pad with spaces
          }
        }
        itemsRemoved.push(`Neutralized ${actionType.replace('/', '')} action (byte-level)`);
        console.log(`[DEBUG] Byte-level: Neutralized ${actionType}`);
      }
    }
  }

  // ===== STEP 6: Remove JavaScript content =====
  if (options.removeJavascript) {
    const jsPatterns = [
      { pattern: /\/JS\s*\([^)]*\)[\s\r\n]*/gi, replacement: '/JS()' },
    ];

    for (const jsPattern of jsPatterns) {
      jsPattern.pattern.lastIndex = 0;
      while ((match = jsPattern.pattern.exec(pdfStr)) !== null) {
        if (!isProtected(match.index, protectedRanges)) {
          const replacement = jsPattern.replacement;
          for (let i = 0; i < match[0].length; i++) {
            if (i < replacement.length) {
              cleaned[match.index + i] = replacement.charCodeAt(i);
            } else {
              cleaned[match.index + i] = 32;
            }
          }
          itemsRemoved.push('Removed JavaScript code (byte-level)');
          console.log('[DEBUG] Byte-level: Removed JavaScript code');
        }
      }
    }
  }

  // ===== STEP 7: Remove URLs (with same-length padding!) =====
  if (options.removeLinks) {
    let urlCount = 0;

    // First, handle UNC paths with embedded URLs (e.g., \\http://...\whatever.xslt)
    const uncUrlPattern = /\\\\+https?:\/\/[^\s"'>]+/gi;
    uncUrlPattern.lastIndex = 0;
    while ((match = uncUrlPattern.exec(pdfStr)) !== null) {
      if (!isProtected(match.index, protectedRanges)) {
        const uncUrl = match[0];
        // Replace entire UNC path with spaces
        for (let i = 0; i < uncUrl.length; i++) {
          cleaned[match.index + i] = 32;
        }
        urlCount++;
        console.log(`[DEBUG] Byte-level: Removed UNC URL: ${uncUrl.substring(0, 50)}...`);
      }
    }

    // Then handle regular URLs
    const urlPattern = /https?:\/\/[^\s"'>\)]+/gi;
    urlPattern.lastIndex = 0;
    while ((match = urlPattern.exec(pdfStr)) !== null) {
      if (!isProtected(match.index, protectedRanges)) {
        const url = match[0];
        // Skip XML namespace URLs (they're legitimate)
        // Check for xmlns: or xmlns with equals sign before the URL
        const beforeUrl = pdfStr.substring(Math.max(0, match.index - 30), match.index);
        if (beforeUrl.includes('xmlns=') || beforeUrl.includes('xmlns:')) {
          console.log(`[DEBUG] Byte-level: Skipped xmlns URL: ${url.substring(0, 50)}...`);
          continue;
        }
        // Pad 'about:blank' to same length as URL
        let replacement = 'about:blank';
        while (replacement.length < url.length) {
          replacement += ' '; // pad with spaces
        }
        replacement = replacement.substring(0, url.length);

        for (let i = 0; i < url.length; i++) {
          cleaned[match.index + i] = replacement.charCodeAt(i);
        }
        urlCount++;
        console.log(`[DEBUG] Byte-level: Removed URL: ${url.substring(0, 50)}...`);
      }
    }

    if (urlCount > 0) {
      itemsRemoved.push(`Removed ${urlCount} external URLs (byte-level)`);
      console.log(`[DEBUG] Byte-level: Removed ${urlCount} URLs with same-length padding`);
    }
  }

  // ===== STEP 8: Remove /AcroForm =====
  if (options.removeForms) {
    const acroFormPattern = /\/AcroForm\s*<<[^>]*>>/g;
    acroFormPattern.lastIndex = 0;
    while ((match = acroFormPattern.exec(pdfStr)) !== null) {
      if (!isProtected(match.index, protectedRanges)) {
        for (let i = 0; i < match[0].length; i++) {
          cleaned[match.index + i] = 32;
        }
        itemsRemoved.push('Removed AcroForm (byte-level)');
        console.log('[DEBUG] Byte-level: Removed AcroForm');
      }
    }
  }

  console.log('[DEBUG] Byte-level cleaning complete');

  return { cleaned, itemsRemoved, warning: warnings.join('; ') || undefined };
}

// Clean a single PDF using pdf-lib with comprehensive error handling
async function cleanPDF(pdfBytes: Uint8Array, options: CleaningOptions): Promise<{
  blob: Blob;
  itemsRemoved: string[];
  warning?: string;
}> {
  const itemsRemoved: string[] = [];
  const warnings: string[] = [];

  // Try pdf-lib first
  try {
    console.log('[DEBUG] Loading PDF with pdf-lib...');

    const pdfDoc = await pdfLib.PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    });

    console.log('[DEBUG] PDF loaded successfully');

    const catalog = pdfDoc.catalog;
    const context = pdfDoc.context;

    // ===== STEP 1: Remove /OpenAction =====
    try {
      const openAction = catalog.get(pdfLib.PDFName.of('OpenAction'));
      if (openAction) {
        let shouldRemove = false;

        if (isPDFDict(openAction)) {
          const s = openAction.get(pdfLib.PDFName.of('S'));
          const sName = s?.toString();
          if (sName) {
            if (options.removeJavascript && sName === '/JavaScript') {
              shouldRemove = true;
            }
            if (options.removeLinks && ['/URI', '/Launch', '/GoToR', '/GoToE', '/SubmitForm', '/ImportData'].includes(sName)) {
              shouldRemove = true;
            }
          }
        } else if (isPDFRef(openAction)) {
          shouldRemove = options.removeJavascript || options.removeLinks;
        }

        if (shouldRemove) {
          catalog.delete(pdfLib.PDFName.of('OpenAction'));
          itemsRemoved.push('Removed OpenAction');
          console.log('[DEBUG] Removed OpenAction');
        }
      }
    } catch (e) {
      console.error('[DEBUG] Error removing OpenAction:', e);
    }

    // ===== STEP 2: Remove /AA (Additional Actions) =====
    try {
      const aa = catalog.get(pdfLib.PDFName.of('AA'));
      if (aa) {
        catalog.delete(pdfLib.PDFName.of('AA'));
        itemsRemoved.push('Removed document Additional Actions');
        console.log('[DEBUG] Removed document AA');
      }
    } catch (e) {
      console.error('[DEBUG] Error removing AA:', e);
    }

    // ===== STEP 3: Remove /Names/JavaScript =====
    if (options.removeJavascript) {
      try {
        const names = catalog.get(pdfLib.PDFName.of('Names'));
        if (isPDFDict(names)) {
          const js = names.get(pdfLib.PDFName.of('JavaScript'));
          if (js) {
            names.delete(pdfLib.PDFName.of('JavaScript'));
            itemsRemoved.push('Removed JavaScript name tree');
            console.log('[DEBUG] Removed Names/JavaScript');
          }
        }
      } catch (e) {
        console.error('[DEBUG] Error removing Names/JavaScript:', e);
      }
    }

    // ===== STEP 4: Remove /AcroForm =====
    if (options.removeForms) {
      try {
        const acroForm = catalog.get(pdfLib.PDFName.of('AcroForm'));
        if (acroForm) {
          catalog.delete(pdfLib.PDFName.of('AcroForm'));
          itemsRemoved.push('Removed AcroForm');
          console.log('[DEBUG] Removed AcroForm');
        }
      } catch (e) {
        console.error('[DEBUG] Error removing AcroForm:', e);
      }
    }

    // ===== STEP 5: Clean pages =====
    try {
      const pages = pdfDoc.getPages();
      console.log(`[DEBUG] Processing ${pages.length} pages`);

      for (let i = 0; i < pages.length; i++) {
        try {
          const page = pages[i];

          // Remove page-level /AA
          try {
            const pageAA = page.node.get(pdfLib.PDFName.of('AA'));
            if (pageAA) {
              page.node.delete(pdfLib.PDFName.of('AA'));
              itemsRemoved.push('Removed page Additional Actions');
              console.log(`[DEBUG] Removed page ${i} AA`);
            }
          } catch (e) {
            console.error(`[DEBUG] Error removing page ${i} AA:`, e);
          }

          // Clean annotations
          try {
            const annots = page.node.get(pdfLib.PDFName.of('Annots'));
            if (annots) {
              console.log(`[DEBUG] Page ${i} has annotations, processing...`);

              const newAnnots = pdfLib.PDFArray.withContext(context);

              if (isPDFArray(annots)) {
                console.log(`[DEBUG] Annotations are in array format, size:`, annots.size());
                const size = annots.size();
                for (let j = 0; j < size; j++) {
                  try {
                    const annotRef = annots.get(j);
                    if (!annotRef) continue;

                    let annot = annotRef;
                    if (isPDFRef(annotRef)) {
                      annot = safeLookup(context, annotRef);
                    }

                    if (isPDFDict(annot)) {
                      const subtype = annot.get(pdfLib.PDFName.of('Subtype'));
                      const subtypeName = subtype?.toString();
                      console.log(`[DEBUG] Annotation ${j} subtype:`, subtypeName);

                      let shouldRemove = false;

                      if (options.removeLinks && subtypeName === '/Link') {
                        // Check if this is an external link
                        const action = annot.get(pdfLib.PDFName.of('A'));
                        if (action) {
                          let isExternal = false;
                          try {
                            if (isPDFDict(action)) {
                              const s = action.get(pdfLib.PDFName.of('S'));
                              const sName = s?.toString();
                              // Check action types that are always external
                              if (['/URI', '/Launch', '/GoToR', '/GoToE', '/SubmitForm', '/ImportData'].includes(sName || '')) {
                                isExternal = true;
                              } else if (sName === '/GoTo') {
                                // /GoTo can be internal or external - check if it has a remote URL
                                const d = action.get(pdfLib.PDFName.of('D'));
                                if (d) {
                                  const dStr = d.toString();
                                  if (dStr.includes('http://') || dStr.includes('https://') || dStr.includes('ftp://')) {
                                    isExternal = true;
                                  }
                                }
                              }
                            }
                          } catch (e) {
                            console.error('[DEBUG] Error checking link action:', e);
                          }

                          if (isExternal) {
                            shouldRemove = true;
                            itemsRemoved.push('Removed external link annotation');
                            console.log(`[DEBUG] Removed external link annotation on page ${i}`);
                          }
                        }
                      }

                      if (options.removeForms && subtypeName === '/Widget') {
                        shouldRemove = true;
                        itemsRemoved.push('Removed form widget annotation');
                        console.log(`[DEBUG] Removed widget annotation on page ${i}`);
                      }

                      if (!shouldRemove) {
                        if (isPDFRef(annotRef)) {
                          newAnnots.push(annotRef);
                        } else if (annot) {
                          newAnnots.push(context.allocate(annot));
                        }
                      }
                    }
                  } catch (e) {
                    console.error(`[DEBUG] Error processing annotation ${j}:`, e);
                  }
                }
              } else if (isPDFRef(annots)) {
                console.log(`[DEBUG] Annotations are single reference`);
                let annot = safeLookup(context, annots);

                if (isPDFDict(annot)) {
                  const subtype = annot.get(pdfLib.PDFName.of('Subtype'));
                  const subtypeName = subtype?.toString();
                  console.log(`[DEBUG] Annotation subtype:`, subtypeName);

                  let shouldRemove = false;

                  if (options.removeLinks && subtypeName === '/Link') {
                    shouldRemove = true;
                    itemsRemoved.push('Removed link annotation');
                    console.log(`[DEBUG] Removed link annotation on page ${i}`);
                  }

                  if (options.removeForms && subtypeName === '/Widget') {
                    shouldRemove = true;
                    itemsRemoved.push('Removed form widget annotation');
                    console.log(`[DEBUG] Removed widget annotation on page ${i}`);
                  }

                  if (!shouldRemove) {
                    newAnnots.push(annots);
                  }
                }
              } else {
                console.log(`[DEBUG] Unknown annotation format, type:`, typeof annots);
              }

              page.node.set(pdfLib.PDFName.of('Annots'), newAnnots);
              console.log(`[DEBUG] Set filtered annotations for page ${i}`);
            }
          } catch (e) {
            console.error(`[DEBUG] Error cleaning annotations on page ${i}:`, e);
          }
        } catch (e) {
          console.error(`[DEBUG] Error processing page ${i}:`, e);
        }
      }
    } catch (e) {
      console.error('[DEBUG] Error processing pages:', e);
      warnings.push(`Could not process all pages: ${(e as Error).message}`);
    }

    // ===== STEP 6: Save the PDF =====
    console.log('[DEBUG] Saving PDF...');
    let savedPdfBytes = await pdfDoc.save();

    // ===== STEP 7: Final URL cleanup with SAME-LENGTH padding (safe for images) =====
    if (options.removeLinks) {
      console.log('[DEBUG] Running final URL cleanup with safe byte-level replacement...');

      // Find streams to protect binary data
      const protectedRanges = findProtectedStreams(savedPdfBytes);
      const protectedCount = protectedRanges.filter(r => !r.subtype).length;
      console.log(`[DEBUG] Found ${protectedRanges.length} streams, ${protectedCount} protected for final cleanup`);

      // Work on a copy
      const cleaned = new Uint8Array(savedPdfBytes);
      const pdfStr = bytesToString(cleaned);
      let urlCount = 0;

      // First, handle UNC paths with embedded URLs (e.g., \\http://...\whatever.xslt)
      const uncUrlPattern = /\\\\+https?:\/\/[^\s"'>]+/gi;
      let match;
      uncUrlPattern.lastIndex = 0;
      while ((match = uncUrlPattern.exec(pdfStr)) !== null) {
        if (!isProtected(match.index, protectedRanges)) {
          const uncUrl = match[0];
          // Replace entire UNC path with spaces
          for (let i = 0; i < uncUrl.length; i++) {
            cleaned[match.index + i] = 32;
          }
          urlCount++;
          console.log(`[DEBUG] Final cleanup: Removed UNC URL`);
        }
      }

      // Then handle regular URLs
      const urlPattern = /https?:\/\/[^\s"'>\)]+/gi;
      urlPattern.lastIndex = 0;
      while ((match = urlPattern.exec(pdfStr)) !== null) {
        if (!isProtected(match.index, protectedRanges)) {
          const url = match[0];
          // Skip XML namespace URLs (they're legitimate)
          // Check for xmlns: or xmlns with equals sign before the URL
          const beforeUrl = pdfStr.substring(Math.max(0, match.index - 30), match.index);
          if (beforeUrl.includes('xmlns=') || beforeUrl.includes('xmlns:')) {
            continue;
          }
          // Pad 'about:blank' to same length as URL
          let replacement = 'about:blank';
          while (replacement.length < url.length) {
            replacement += ' '; // pad with spaces
          }
          replacement = replacement.substring(0, url.length);

          for (let i = 0; i < url.length; i++) {
            cleaned[match.index + i] = replacement.charCodeAt(i);
          }
          urlCount++;
        }
      }

      if (urlCount > 0) {
        itemsRemoved.push(`Removed ${urlCount} external URLs from final PDF`);
        console.log(`[DEBUG] Final cleanup: Removed ${urlCount} URLs with same-length padding`);
        savedPdfBytes = cleaned;
      }
    }

    const blob = new Blob([savedPdfBytes], { type: "application/pdf" });

    console.log('[DEBUG] PDF saved with pdf-lib, size:', savedPdfBytes.length);
    console.log('[DEBUG] Items removed:', itemsRemoved);

    return {
      blob,
      itemsRemoved,
      warning: warnings.length > 0 ? warnings.join('; ') : undefined,
    };
  } catch (pdfLibError) {
    // pdf-lib failed - fall back to byte-level cleaning
    console.error('[DEBUG] pdf-lib failed, falling back to byte-level cleaning:', pdfLibError);

    const result = cleanPDFBytes(pdfBytes, options);

    const blob = new Blob([result.cleaned], { type: "application/pdf" });

    console.log('[DEBUG] Byte-level cleaning complete, size:', result.cleaned.length);
    console.log('[DEBUG] Items removed:', result.itemsRemoved);

    return {
      blob,
      itemsRemoved: result.itemsRemoved,
      warning: result.warning || `Used byte-level fallback: ${(pdfLibError as Error).message}`,
    };
  }
}

self.onmessage = async (e: MessageEvent<{ file: File; options: CleaningOptions }>) => {
  const { file, options } = e.data;

  console.log('[DEBUG] Worker received file:', file.name, 'size:', file.size);
  console.log('[DEBUG] Options:', options);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdfBytes = new Uint8Array(arrayBuffer);

    const result = await cleanPDF(pdfBytes, options);

    self.postMessage({
      success: true,
      blob: result.blob,
      itemsRemoved: result.itemsRemoved,
      warning: result.warning,
    });
  } catch (error) {
    console.error('[DEBUG] Error processing PDF:', error);

    // Return the original file if cleaning failed completely
    const originalBlob = new Blob([await file.arrayBuffer()], { type: file.type });

    self.postMessage({
      success: true,
      blob: originalBlob,
      itemsRemoved: [],
      warning: `Could not clean PDF: ${(error as Error).message}`,
    });
  }
};
