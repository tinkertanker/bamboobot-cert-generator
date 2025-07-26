# TODOs 

## 1. Advanced text sizing ✅ COMPLETED

Use case: What if we want to let text auto-resize down to fit into a box? I'm thinking perhaps the bounding box, when it comes up, naturally takes on the full width, and can be resized to more than one line. Maybe there are more controls in the formatting area to allow for multi line.

### Implemented Features:
- [x] **Text Sizing Modes**: 
  - "Shrink to Fit" - Automatically reduces font size to fit single line within width
  - "Multi-line" - Fixed 2-line mode with word wrap and ellipsis for overflow
- [x] **Width Control**: Adjustable text field width (10-90%) with slider control
- [x] **Default Settings**: New text fields default to center-aligned, 90% width, shrink-to-fit mode
- [x] **PDF Generation**: Full support for both modes in PDF output with accurate rendering
- [x] **UI Updates**: Reorganized formatting panel with improved layout:
  - Top row: Font, Style (B/I/visibility), Size
  - Bottom row: Resizing mode, Alignment, Colour
- [x] **Coordinate System**: Successfully handled UI (top-left) to PDF (bottom-left) conversion

### Not Implemented (Future Enhancements):
- [ ] Drag handles at corners/edges for visual resizing (width is controlled via slider instead)
- [ ] Variable number of lines (fixed at 2 lines for multi-line mode)
- [ ] Vertical text resizing (only horizontal width control implemented)

### Implementation Considerations & Challenges

**Critical Challenge - Coordinate System Mismatch:**
- UI uses top-left origin (0,0 at top-left corner, Y increases downward)
- PDF uses bottom-left origin (0,0 at bottom-left corner, Y increases upward)
- CSS transforms (translate) add complexity when calculating absolute positions
- Text baseline positioning differs between CSS and PDF rendering

**Recommended Implementation Approach:**
1. **Start with absolute positioning** - Avoid CSS transform: translate(-50%, -50%) for centering
   - Use absolute left/top positioning with explicit width/height instead
   - This makes coordinate conversion more predictable

2. **Build visual debugging tools first:**
   - Draw colored rectangles in PDF to show exact bounding box positions
   - Add coordinate overlay in UI showing x,y,width,height values
   - Create side-by-side comparison tool for UI vs PDF output

3. **Handle text positioning carefully:**
   - PDF text is positioned by baseline, not top edge like CSS
   - Account for font metrics (ascent/descent) when calculating Y position
   - Consider using PDF's text measurement APIs before drawing

4. **Implement in phases:**
   - Phase 1: Fixed pixel positioning with single-line text
   - Phase 2: Add percentage-based positioning
   - Phase 3: Add multi-line support with wrapping
   - Phase 4: Add auto-resize functionality

**Technical Pitfalls to Avoid:**
- Don't mix decimal (0-1) and percentage (0-100) position values without clear conversion
- PDF-lib doesn't support text clipping - implement manual line truncation
- Input fields for width/height percentages need debouncing to prevent erratic behavior
- Resize handles need different visual treatment than alignment guides (use different colors/shapes)

**Testing Strategy:**
- Create Playwright tests that generate PDFs and take screenshots
- Use image comparison to verify UI matches PDF output
- Test with various fonts as they have different metrics
- Test edge cases: very long text, very small boxes, extreme aspect ratios

**Alternative Approaches to Consider:**
- Use a PDF library with better text box support (investigate pdfkit or jsPDF)
- Render text as SVG first, then convert to PDF (better control)
- Use fixed aspect ratio boxes initially to simplify calculations

## 2. Data Validation (Medium Priority - NOW TOP PRIORITY)
- [ ] Visual indicators for empty required fields
- [ ] Email format validation
- [ ] Duplicate detection

## 3. Better Error Messages (Medium Priority)
- [ ] Replace technical errors with user-friendly messages
- [ ] Add "Try again" buttons
- [ ] Suggest fixes for common issues

## 4. Progressive PDF Modal Enhancements
- [ ] ZIP Download in Progressive Modal - Add ZIP download button (currently only in Individual PDFs modal)
- [ ] Email All from Progressive Modal - Add email all button (currently requires closing and reopening in Individual PDFs modal)

## 5. Quick Wins (< 1 day each)
- [ ] Entry jump navigation (go to specific row)
- [ ] Performance optimizations (React.memo, debouncing)
- [ ] Loading states for async operations
- [ ] Tooltip improvements 