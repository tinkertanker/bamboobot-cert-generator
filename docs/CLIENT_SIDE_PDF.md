# Client-Side PDF Generation

Certificates are generated in the browser by default. The server is a fallback for browsers that cannot do it, and for batches too large for the device.

## Choosing client or server

`getPdfGenerationMethod` in `hooks/usePdfGenerationMethods.tsx` decides, in this order:

1. Dev Mode with "server" chosen explicitly: server.
2. Browser not supported (`lib/pdf/client/feature-detection.ts` checks Web Workers, ArrayBuffer, fetch and available memory): server.
3. Otherwise: client.

For individual PDFs there is one more check. `lib/pdf/client/individual-capacity.ts` estimates the memory the batch will need from the row count, template size, number of fields and custom fonts. If it does not fit (or there are more than 500 rows, or more than 100 when the browser reports neither its JS heap limit nor its device memory), generation moves to the server.

Server generation of individual PDFs uses progressive batches when there are more than 100 rows (`PROGRESSIVE_PDF` in `utils/constants.ts`), with pause, resume and cancel.

## Pieces

| File | Role |
| --- | --- |
| `hooks/useClientPdfGeneration.ts` | React hook used by the editor; wraps the generator and reports progress |
| `lib/pdf/client/pdf-generator-client.ts` | Starts the worker, sends jobs, collects results |
| `lib/pdf/client/worker/pdf-worker-with-fonts.ts` | Web Worker entry; builds PDFs with pdf-lib and fontkit |
| `lib/pdf/client/font-manager.ts` | Fetches TTFs from `public/fonts/`, caches them in memory and IndexedDB |
| `lib/pdf/client/image-to-pdf.ts` | Turns the uploaded PNG/JPEG into a PDF page to stamp on |
| `lib/pdf/shared/pdf-generation-core.ts` | Coordinate conversion, text placement, shrink-to-fit and two-line wrapping, shared with the server |

All ten fonts, bold and italic variants, both text modes and ZIP download (JSZip, in `components/modals/IndividualPdfsModal.tsx`) work client-side.

## Building the worker

The worker is bundled separately by webpack (`webpack.worker.config.js`) into `public/pdf-worker.js` plus chunk files. `npm run dev` and `npm run build` rebuild it, and the output is committed, so run `npm run build:worker` and commit the result whenever you change the worker, `lib/pdf/shared/`, or anything they import.

## Debugging

`useClientPdfGeneration` returns `getCapabilityReport()`, a text report of worker, IndexedDB and memory support and the overall verdict; log it from the editor when a browser unexpectedly falls back to the server. In Dev Mode you can generate the same batch on the server to compare output.

## Known gaps

- Emailing download links needs the PDFs in cloud storage, which client-side generation does not do. Email attachments work. See `TODO.md`.
- `ClientPdfGenerator.generateProgressive` exists but the editor does not use it; client batches run in one pass.
