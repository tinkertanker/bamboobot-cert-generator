# TODOs 

## Actual things I wanted to do. Maximum priority!

- [x] ~~First time pressing "generate" after uploading and adding a text gives an error. Pressing generate after that works again though.~~ **FIXED!** 🎉 
- [x] ~~We really should refactor all the "Template" names into "Project". It's getting confusing for the AI. But we have to be very careful not to overwrite what else could be called a "template" in the code, so we don't just blindly change things! Also, beware the tests, which have lots of dependencies on these.~~ **DONE!** Refactored to use "Project" naming throughout
- [ ] I get the nagging feeling that there's a lot of confusion over server-side rendering and client-side rendering in the code. Does this need to be cleaned up?
- [x] ~~When creating the first field on the preview panel, it should already be selected~~ **DONE!**
- [ ] Text field colour should adapt to the general tone of the background image. If it's a dark background, make a light colour for the text. 
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
