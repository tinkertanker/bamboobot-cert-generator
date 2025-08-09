# Client-Side PDF Generation

## Overview

The certificate generator now supports client-side PDF generation, allowing PDFs to be created directly in the browser without server round-trips. This feature reduces server load, improves performance, and enables offline PDF generation.

## Architecture

### Components

1. **PDF Worker** (`lib/pdf/client/worker/pdf-worker-simplified.ts`)
   - Runs in a Web Worker to avoid blocking the UI
   - Handles all PDF generation operations
   - Uses pdf-lib library for PDF manipulation

2. **Font Manager** (`lib/pdf/client/font-manager.ts`)
   - Manages font loading and caching
   - Uses IndexedDB for persistent storage
   - Implements memory management with LRU eviction

3. **Feature Detection** (`lib/pdf/client/feature-detection.ts`)
   - Checks browser capabilities
   - Determines if client-side generation is supported
   - Provides memory estimation and limits

4. **Client PDF Generator** (`lib/pdf/client/pdf-generator-client.ts`)
   - Main interface for client-side generation
   - Manages worker lifecycle
   - Handles progress tracking

5. **React Hook** (`hooks/useClientPdfGeneration.ts`)
   - Integrates client-side generation with React components
   - Provides same interface as server-side generation
   - Manages state and cleanup

### Coordinate System

The shared coordinate transformation module (`lib/pdf/shared/coordinate-transform.ts`) ensures consistent positioning between client and server implementations:

- UI uses top-left origin (0,0 at top-left)
- PDF uses bottom-left origin (0,0 at bottom-left)
- Transformation: `pdfY = height - (uiY * height)`

## Features

### Supported
- ✅ Single merged PDF generation
- ✅ Individual PDF generation
- ✅ Standard fonts (Helvetica, Times, Courier)
- ✅ Basic text positioning and alignment
- ✅ Progress tracking
- ✅ Memory management
- ✅ Browser capability detection

### Not Yet Implemented
- ❌ Custom font loading (Montserrat, Poppins, etc.)
- ❌ Progressive batch generation
- ❌ Advanced text features (multiline, shrink-to-fit)
- ❌ Client-side ZIP creation

## Usage

### Enable Client-Side Generation

Client-side PDF generation is currently only available in development mode. To use it:

1. The system automatically detects browser capabilities
2. If supported, PDFs are generated client-side
3. If not supported, falls back to server-side generation

### Browser Requirements

- Modern browser with Web Worker support
- Sufficient memory (2GB+ recommended)
- JavaScript enabled

### Performance Considerations

| Dataset Size | Recommended Mode | Notes |
|-------------|------------------|-------|
| 1-50 rows | Client-side | Fast, no network latency |
| 50-100 rows | Client-side | Monitor memory usage |
| 100-500 rows | Server-side | Better memory management |
| 500+ rows | Progressive server | Batch processing required |

## Development

### Building the Worker

The PDF worker is built separately using webpack:

```bash
npm run build:worker
```

This creates `public/pdf-worker.js` which is loaded by the client.

### Testing

1. Enable Dev Mode in the UI
2. The system will automatically use client-side generation if supported
3. Check the browser console for capability report
4. Monitor memory usage in Chrome DevTools

### Debugging

To get a capability report:
```javascript
const report = await featureDetector.getCapabilityReport();
console.log(report);
```

Output example:
```
=== Browser Capability Report ===
Web Worker Support: ✅
IndexedDB Support: ✅ (optional)
ArrayBuffer Support: ✅
Fetch API Support: ✅
Memory Estimation Available: ✅
Sufficient Memory: ✅

=== Memory Information ===
Device Memory: 8GB
JS Heap Limit: 4096MB
JS Heap Used: 152MB

=== Overall Support: ✅ Ready ===
```

## Implementation Status

### Phase 1: Core Infrastructure ✅
- Created library structure
- Implemented font manager with caching
- Built Web Worker for PDF generation
- Added feature detection

### Phase 2: Basic Generation ✅
- Single PDF generation working
- Individual PDF generation working
- Basic text positioning implemented
- Progress tracking added

### Phase 3: Progressive Generation 🚧
- Queue system not yet implemented
- Pause/resume functionality pending
- Memory monitoring in progress

### Phase 4: UI Integration 🚧
- Basic integration complete
- Dev Mode toggle pending
- Performance metrics pending

### Phase 5: Optimization 📅
- Font subsetting not implemented
- PDF object reuse pending
- Advanced caching strategies pending

## Future Improvements

1. **Custom Font Support**
   - Load fonts dynamically from server
   - Implement font subsetting
   - Cache fonts in IndexedDB

2. **Advanced Features**
   - Multiline text support
   - Shrink-to-fit text
   - Text box width calculations

3. **Performance**
   - Implement PDF object pooling
   - Add streaming generation
   - Optimize memory usage

4. **User Experience**
   - Add detailed progress indicators
   - Implement retry mechanisms
   - Provide memory warnings

## Limitations

1. **Font Loading**: Custom fonts require server access for initial load
2. **Memory**: Large datasets may exceed browser memory limits
3. **Browser Support**: Older browsers fall back to server-side
4. **File Access**: Cannot save directly to filesystem (download only)

## Security Considerations

- All processing happens in the browser
- No sensitive data sent to server
- Font files cached locally
- IndexedDB storage is origin-scoped