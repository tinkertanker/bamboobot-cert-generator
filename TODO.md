# TODOs

## Actual things I wanted to do. Maximum priority!

- [x] ✅ I get the nagging feeling that there's a lot of confusion over server-side rendering and client-side rendering in the code. Does this need to be cleaned up?
  - **COMPLETED (Sept 2025)**: Cleaned up the confusion. Now CLIENT-FIRST by default:
    - Client-side PDF generation is now the DEFAULT when supported
    - Server-side is only used as fallback (unsupported browsers) or when explicitly requested in Dev Mode
    - Updated `usePdfGenerationMethods` hook to prioritize client-side
    - Added clear documentation and legacy markers to all server-side code
    - Updated CLAUDE.md and CLIENT_SIDE_PDF.md to reflect this philosophy
- [x] ✅ Text field colour should adapt to the general tone of the background image. If it's a dark background, make a light colour for the text.
  - COMPLETED: On image load, the app analyzes average image luminance and auto-sets default text colours to ensure contrast (white on dark images, black on light images). Existing custom colours are preserved; only default black/white values are adapted.
- [ ] We should have some kind of email download links; see below.

## Future Enhancement: Email Download Links for Client-Side PDFs

Currently, when using client-side PDF generation:

- ✅ **Email attachments work** - PDFs are sent directly as attachments
- ❌ **Download links don't work** - Would require uploading PDFs to cloud storage first

To implement download links for client-side PDFs:

1. When "Download Link" is selected with client-side PDFs
2. Upload each PDF to cloud storage (R2/S3) via a new API endpoint
3. Get back the public URL
4. Send that URL in the email

This would add complexity and negate some benefits of client-side generation (like reduced server load), so it's deferred until there's a clear need.

UI-wise, we would let the user decide this at the summary modal they get when they click generate.

## Some stuff Claude came up with

### 1. Data Validation (High Priority)

- [ ] Visual indicators for empty required fields
- [ ] Email format validation
- [ ] Duplicate detection

### 2. Better Error Messages (Medium Priority)

- [ ] Replace technical errors with user-friendly messages
- [ ] Add "Try again" buttons
- [ ] Suggest fixes for common issues

### 4. Performance Optimizations (High Impact)

#### 4.1 React.memo Optimization for CertificatePreview

- [ ] Replace expensive `JSON.stringify()` comparison with selective shallow + deep checks
- [ ] Only compare current table row data, not entire array
- [ ] Compare only position properties that affect rendering
- **Expected Impact**: 85-90% reduction in comparison time during drag operations

#### 4.2 Smart Debouncing for Drag Operations

- [ ] Create `useDragDebounce` hook with immediate visual feedback + settled state
- [ ] Use 16ms throttle for visual updates (60fps smooth dragging)
- [ ] Use 50ms debounce for final position updates
- **Expected Impact**: 40-50% fewer React renders during drag

#### 4.3 Lazy Font Loading

- [ ] Create `FontManager` singleton for dynamic font loading
- [ ] Load only Rubik + system fonts initially
- [ ] Load Google Fonts (Montserrat, Poppins, etc.) only when selected
- [ ] Add font preloading for commonly used fonts
- **Expected Impact**: 70% smaller initial bundle (~350KB saved), 200-400ms faster load

#### 4.4 Text Measurement Cache

- [ ] Implement singleton canvas context for text measurements
- [ ] Add LRU cache for text width calculations (max 1000 entries)
- [ ] Cache key: `text|fontSize|fontFamily|bold|italic`
- **Expected Impact**: 60-80% faster text calculations

### 5. Quick Wins (< 1 day each)

- [ ] Entry jump navigation (go to specific row)
- [ ] Loading states for async operations
- [ ] Tooltip improvements
- [ ] Add performance monitoring utility for measuring improvements
