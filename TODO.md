# TODOs 

## Current Priority Tasks 📌

### 1. Data Validation (High Priority)
- [ ] Visual indicators for empty required fields
- [ ] Email format validation
- [ ] Duplicate detection

### 2. Better Error Messages (Medium Priority)
- [ ] Replace technical errors with user-friendly messages
- [ ] Add "Try again" buttons
- [ ] Suggest fixes for common issues

### 3. Progressive PDF Modal Enhancements
- [ ] ZIP Download in Progressive Modal - Add ZIP download button (currently only in Individual PDFs modal)
- [ ] Email All from Progressive Modal - Add email all button (currently requires closing and reopening in Individual PDFs modal)

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