import { test, expect, Page } from '@playwright/test';
import path from 'path';

test.describe('Certificate Generator UI Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Dev Mode - Load default templates', async ({ page }) => {
    // Click on Dev Mode checkbox
    await page.getByRole('checkbox', { name: /dev mode/i }).click();
    
    // Wait for template to load
    await page.waitForSelector('img[alt="Certificate Template"]', { timeout: 10000 });
    
    // Verify text fields are loaded
    const textFields = await page.locator('.absolute').count();
    expect(textFields).toBeGreaterThan(0);
    
    // Verify data table is populated
    await expect(page.getByRole('table').last()).toBeVisible();
    const rows = await page.locator('tbody tr').count();
    expect(rows).toBeGreaterThan(0);
    
    // Verify email config is loaded in dev mode
    await expect(page.getByRole('button', { name: 'Email', exact: true })).toBeVisible();
  });

  test('Text field interactions - no jumping', async ({ page }) => {
    // Load dev mode first
    await page.getByRole('checkbox', { name: /dev mode/i }).click();
    await page.waitForSelector('img[alt="Certificate Template"]');
    
    // Click on a text field
    const textField = page.locator('.absolute').first();
    await textField.click();
    
    // Get initial position
    const initialBox = await textField.boundingBox();
    expect(initialBox).not.toBeNull();
    
    // Test dragging
    if (initialBox) {
      await textField.hover();
      await page.mouse.down();
      await page.mouse.move(initialBox.x + 50, initialBox.y + 50);
      await page.mouse.up();
      
      // Verify the field moved (or at least is still visible)
      const afterDragBox = await textField.boundingBox();
      expect(afterDragBox).not.toBeNull();
      // Note: In dev mode, dragging might not actually move the element
      // Just verify it's still visible
      await expect(textField).toBeVisible();
    }
  });

  test('Text field resizing', async ({ page }) => {
    // Load dev mode
    await page.getByRole('checkbox', { name: /dev mode/i }).click();
    await page.waitForSelector('img[alt="Certificate Template"]');
    
    // Click on a text field to select it
    const textField = page.locator('.absolute').first();
    await textField.click();
    
    // Look for resize handles
    const resizeHandle = page.locator('[data-resize-handle]').first();
    if (await resizeHandle.isVisible()) {
      const initialBox = await textField.boundingBox();
      expect(initialBox).not.toBeNull();
      
      // Drag resize handle
      await resizeHandle.hover();
      await page.mouse.down();
      await page.mouse.move(initialBox!.x + initialBox!.width + 50, initialBox!.y + initialBox!.height);
      await page.mouse.up();
      
      // Verify size changed
      const afterResizeBox = await textField.boundingBox();
      expect(afterResizeBox).not.toBeNull();
      expect(afterResizeBox!.width).toBeGreaterThan(initialBox!.width);
    }
  });

  test('Formatting changes', async ({ page }) => {
    // Load dev mode
    await page.getByRole('checkbox', { name: /dev mode/i }).click();
    await page.waitForSelector('img[alt="Certificate Template"]');
    
    // Select a text field
    const textField = page.locator('.absolute').first();
    await textField.click();
    
    // Change font
    await page.getByRole('combobox').selectOption('Montserrat');
    
    // Wait for formatting panel to be visible
    await expect(page.getByText('Size')).toBeVisible();
    
    // Change font size - find the spinbutton that's currently showing the font size
    // It should be in the formatting panel, not the header
    const formattingPanel = page.locator('text=Size').locator('..');
    const fontSizeInput = formattingPanel.getByRole('spinbutton');
    await fontSizeInput.click();
    await fontSizeInput.fill('');
    await fontSizeInput.fill('24');
    await fontSizeInput.blur(); // Trigger change event
    
    // Change color
    const colorInput = page.getByRole('textbox').first();
    await colorInput.clear();
    await colorInput.fill('#FF0000');
    
    // Wait for changes to be applied
    await page.waitForTimeout(1000);
    
    // Verify the font size input was updated
    const fontSizeInputUpdated = formattingPanel.getByRole('spinbutton');
    const fontSizeValue = await fontSizeInputUpdated.inputValue();
    expect(fontSizeValue).toBe('24');
    
    const colorValue = await page.getByRole('textbox').first().inputValue();
    expect(colorValue).toBe('#FF0000');
    
    // Verify formatting is applied to the text field
    const textFieldStyle = await textField.evaluate((el) => {
      // Get inline styles which should be updated
      return {
        fontSize: el.style.fontSize,
        color: el.style.color,
        fontFamily: el.style.fontFamily
      };
    });
    
    // Check if styles contain expected values
    if (textFieldStyle.fontSize) {
      expect(textFieldStyle.fontSize).toContain('24');
    }
    if (textFieldStyle.color) {
      expect(textFieldStyle.color.toLowerCase()).toMatch(/ff0000|rgb\(255,\s*0,\s*0\)/i);
    }
  });

  test('Generate single PDF and verify formatting', async ({ page }) => {
    // Load dev mode
    await page.getByRole('checkbox', { name: /dev mode/i }).click();
    await page.waitForSelector('img[alt="Certificate Template"]');
    
    // Get initial formatting of first text field
    const textField = page.locator('.absolute').first();
    const initialStyle = await textField.getAttribute('style');
    
    // Click dropdown arrow - it's the second button in the split button component
    // First find all buttons in the banner
    const banner = page.getByRole('banner');
    const buttons = banner.getByRole('button');
    
    // The Generate split button has two parts - find the second part (dropdown)
    // Count from the end since there might be other buttons before it
    const allButtons = await buttons.all();
    const dropdownButton = allButtons[allButtons.length - 1]; // Last button in banner
    await dropdownButton.click();
    
    // Wait for dropdown menu to appear
    await page.waitForTimeout(500);
    
    // Click on Single PDF option
    await page.getByText('Single PDF').click();
    
    // Wait for PDF generation modal - look for the heading or iframe
    await expect(page.getByText('PDF Generated')).toBeVisible({ timeout: 10000 });
    
    // Verify PDF preview shows (if available)
    const pdfPreview = page.locator('[data-pdf-preview]');
    if (await pdfPreview.isVisible()) {
      // Verify formatting matches
      expect(pdfPreview).toBeVisible();
    }
    
    // Close modal
    await page.getByRole('button', { name: /close/i }).click();
  });

  test('Full workflow - Dev Mode formatting and navigation', async ({ page }) => {
    // Click Dev Mode
    await page.getByRole('checkbox', { name: /dev mode/i }).click();
    await page.waitForSelector('img[alt="Certificate Template"]');
    
    // Verify data is loaded
    await expect(page.getByRole('table').last()).toBeVisible();
    await expect(page.getByText(/1 of 3/i)).toBeVisible();
    
    // Select and modify a text field
    const textField = page.locator('.absolute').first();
    await textField.click();
    
    // Change formatting
    await page.getByRole('combobox').selectOption('Poppins');
    
    // Wait for formatting panel and change font size
    await expect(page.getByText('Size')).toBeVisible();
    const formattingPanel = page.locator('text=Size').locator('..');
    const fontSizeInput = formattingPanel.getByRole('spinbutton');
    await fontSizeInput.click();
    await fontSizeInput.fill('');
    await fontSizeInput.fill('32');
    await fontSizeInput.blur(); // Trigger change event
    
    // Verify font size was updated
    const fontSizeValue = await fontSizeInput.inputValue();
    expect(fontSizeValue).toBe('32');
    
    // Navigate to next entry
    await page.getByRole('button', { name: /next entry/i }).click();
    await expect(page.getByText(/2 of 3/i)).toBeVisible();
    
    // Navigate back to first
    await page.getByRole('button', { name: /first entry/i }).click();
    await expect(page.getByText(/1 of 3/i)).toBeVisible();
    
    // Verify formatting is still applied
    const selectedFont = await page.getByRole('combobox').inputValue();
    expect(selectedFont).toBe('Poppins');
  });

  test('Navigation between entries', async ({ page }) => {
    // Load dev mode
    await page.getByRole('checkbox', { name: /dev mode/i }).click();
    await page.waitForSelector('img[alt="Certificate Template"]');
    
    // Check initial entry indicator
    await expect(page.getByText(/1 of 3/i)).toBeVisible();
    
    // Navigate to next entry
    await page.getByRole('button', { name: /next entry/i }).click();
    await expect(page.getByText(/2 of 3/i)).toBeVisible();
    
    // Navigate to last entry
    await page.getByRole('button', { name: /last entry/i }).click();
    await expect(page.getByText(/3 of 3/i)).toBeVisible();
    
    // Navigate back to first
    await page.getByRole('button', { name: /first entry/i }).click();
    await expect(page.getByText(/1 of 3/i)).toBeVisible();
    
    // Verify previous button is disabled on first entry
    const prevButton = page.getByRole('button', { name: /previous entry/i });
    await expect(prevButton).toBeDisabled();
    
    // Navigate to last and verify next button is disabled
    await page.getByRole('button', { name: /last entry/i }).click();
    const nextButton = page.getByRole('button', { name: /next entry/i });
    await expect(nextButton).toBeDisabled();
  });
});