# Playwright E2E Tests

This directory contains end-to-end UI tests for the Bamboobot Certificate Generator application using Playwright.

## Test Structure

### Test Suites

1. **certificate-generator.spec.ts** - Main UI workflows
   - Dev Mode activation and template loading
   - Text field interactions (clicking, dragging, resizing)
   - Formatting changes (font, size, color, style)
   - PDF generation (single and bulk)
   - Navigation between entries
   - Full workflow from Dev Mode to PDF

2. **text-field-stability.spec.ts** - Position stability tests
   - Ensures text fields don't "jump" when clicked
   - Verifies position stability during formatting changes
   - Tests drag-and-drop precision
   - Validates behavior with rapid interactions
   - Tests resizing without position changes
   - Alignment changes without jumping

3. **pdf-generation.spec.ts** - PDF generation verification
   - Single PDF generation with formatting preservation
   - Bulk PDF generation with progress tracking
   - PDF modal functionality and preview
   - Format consistency between preview and PDF
   - Individual PDFs modal navigation
   - Email functionality within PDF modals

### Utilities

**helpers/test-utils.ts** - Reusable test utilities
- `loadDevMode()` - Activate Dev Mode and wait for elements
- `selectTextField()` - Select and focus a text field
- `verifyNoJumping()` - Verify element stability during actions
- `generateSinglePDF()` - Generate single PDF via dropdown
- `captureFormatting()` - Capture text field formatting state
- `compareFormatting()` - Compare formatting between states
- `applyFormatting()` - Apply formatting options to text fields
- `navigateToEntry()` - Navigate between certificate entries
- `resizeTextField()` - Resize text field dimensions
- `moveTextField()` - Move text field to specific position
- And more...

## Running Tests

```bash
# Install Playwright browsers (first time only)
npm run test:e2e:install

# Run all tests
npm run test:e2e

# Run tests in headed mode (see browser)
npm run test:e2e:headed

# Run tests with UI mode (interactive)
npm run test:e2e:ui

# Debug a specific test
npm run test:e2e:debug

# View HTML test report
npm run test:e2e:report

# Run a specific test file
npx playwright test e2e/text-field-stability.spec.ts

# Run tests matching a pattern
npx playwright test -g "Dev Mode"
```

## Test Strategy

The tests focus on:
1. **Visual Stability**: Ensuring UI elements don't jump or move unexpectedly
2. **Formatting Accuracy**: Verifying that formatting changes are applied correctly
3. **PDF Generation**: Confirming that PDFs are generated with correct formatting
4. **User Workflows**: Testing complete user journeys from start to finish

## Using Playwright MCP

These tests can also be run using the Playwright MCP (Model Context Protocol) for automated browser testing. The MCP provides direct browser control for:
- Navigation
- Element interaction
- Screenshot capture
- Accessibility testing

## Debugging Tips

1. Use `--headed` mode to see what's happening
2. Add `await page.pause()` in tests to pause execution
3. Use `--debug` flag to step through tests
4. Check `test-results/` folder for failure screenshots

## Common Issues

1. **Timeouts**: Increase timeout in `playwright.config.ts` if needed
2. **Port conflicts**: Ensure port 3000 is free or update `webServer.port`
3. **Missing elements**: Check selectors match current UI implementation
4. **Flaky tests**: Use proper waits instead of arbitrary timeouts

## Writing New Tests

When adding new tests:

1. Import utilities from `helpers/test-utils.ts`:
   ```typescript
   import { loadDevMode, selectTextField, applyFormatting } from './helpers/test-utils';
   ```

2. Use the Page Object pattern for complex interactions:
   ```typescript
   test('my new test', async ({ page }) => {
     await page.goto('/');
     await loadDevMode(page);
     
     const textField = await selectTextField(page, 0);
     await applyFormatting(page, {
       font: 'Poppins',
       fontSize: '24',
       color: '#FF0000'
     });
   });
   ```

3. Always wait for elements to be ready:
   ```typescript
   await expect(element).toBeVisible();
   await page.waitForLoadState('networkidle');
   ```

## Configuration

Tests are configured in `playwright.config.ts`:
- Base URL: http://localhost:3000
- Test directory: ./e2e
- Browser: Chromium (can be extended to Firefox/Safari)
- Automatic dev server startup
- Screenshots on failure
- Video recording on failure
- HTML reporter

## Best Practices

1. **Keep tests independent** - Each test should set up its own state
2. **Use meaningful test names** - Describe what the test verifies
3. **Avoid hard-coded waits** - Use Playwright's built-in waiting mechanisms
4. **Clean up after tests** - Close modals, reset state if needed
5. **Use data-testid** attributes for critical elements (when available)
6. **Group related tests** using `test.describe()`
7. **Use test fixtures** for common setup/teardown

## Current Test Status

### Certificate Generator Tests (6/7 passing) ✅
- ✅ Dev Mode - Load default templates
- ✅ Text field interactions - no jumping
- ✅ Text field resizing
- ✅ Formatting changes
- ❌ Generate single PDF and verify formatting (timeout waiting for modal)
- ✅ Full workflow - Dev Mode formatting and navigation
- ✅ Navigation between entries

### Known Issues
- PDF generation tests may timeout in the test environment due to modal appearance timing
- Some tests are sensitive to the exact structure of UI elements (dropdowns, modals)

## CI/CD Integration

For CI environments:
- Tests run with `CI=true` environment variable
- Retries are enabled (2 attempts)
- Tests fail if `test.only` is left in code
- Parallelization is disabled for consistency

## Maintenance

- Update selectors when UI changes
- Review and update tests when new features are added
- Run tests locally before pushing changes
- Monitor test execution time and optimize slow tests
- Keep test utilities DRY (Don't Repeat Yourself)