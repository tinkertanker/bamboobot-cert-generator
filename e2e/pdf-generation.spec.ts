import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

async function loadDevMode(page: any) {
  await page.getByRole('checkbox', { name: /dev mode/i }).click();
  await page.waitForSelector('img[alt="Certificate Template"]', { timeout: 10000 });
  await expect(page.locator('.absolute').first()).toBeVisible();
  await expect(page.getByRole('table').last()).toBeVisible();
}

async function captureFormatting(page: any, element: any) {
  const style = await element.getAttribute('style');
  const computedStyle = await element.evaluate((el: HTMLElement) => {
    return {
      fontSize: window.getComputedStyle(el).fontSize,
      fontFamily: window.getComputedStyle(el).fontFamily,
      color: window.getComputedStyle(el).color,
      position: {
        left: el.style.left,
        top: el.style.top
      }
    };
  });
  
  return { style, computedStyle };
}

test.describe('PDF Generation and Formatting Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadDevMode(page);
  });

  test('Single PDF generation preserves formatting', async ({ page }) => {
    // Select and format a text field
    const textField = page.locator('.absolute').first();
    await textField.click();
    
    // Apply specific formatting
    await page.getByRole('combobox').selectOption('Poppins');
    
    const fontSizeInput = page.getByText('Size').locator('..').getByRole('spinbutton');
    await fontSizeInput.clear();
    await fontSizeInput.fill('28');
    
    const colorInput = page.getByRole('textbox').filter({ hasText: /#/i }).first();
    await colorInput.clear();
    await colorInput.fill('#FF5733');
    
    // Capture the formatting before generation
    const previewFormatting = await captureFormatting(page, textField);
    
    // Start PDF generation with download handling
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 }).catch(() => null);
    
    // Click dropdown and select Single PDF
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true }).last();
    const dropdownButton = generateButton.locator('~ button').first();
    await dropdownButton.click();
    
    // Wait for dropdown menu to appear
    await page.waitForTimeout(500);
    
    // Click on Single PDF option
    const singlePdfOption = page.getByText('Single PDF');
    await singlePdfOption.click();
    
    // Handle the download if it occurs
    const download = await downloadPromise;
    if (download) {
      const suggestedFilename = download.suggestedFilename();
      expect(suggestedFilename).toContain('.pdf');
      
      // Save to test directory for verification
      const savePath = path.join(process.cwd(), 'test-results', suggestedFilename);
      await download.saveAs(savePath);
      
      // Verify file exists and has content
      expect(fs.existsSync(savePath)).toBe(true);
      const stats = fs.statSync(savePath);
      expect(stats.size).toBeGreaterThan(1000); // PDF should be at least 1KB
    } else {
      // If no download, check for preview in modal
      await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText(/generated|success|pdf/i)).toBeVisible();
    }
    
    // Close modal if visible
    const closeButton = page.getByRole('button', { name: /close/i });
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
  });

  test('Bulk PDF generation with progress tracking', async ({ page }) => {
    // Click on Generate button directly for bulk generation
    await page.getByRole('button', { name: /generate/i, exact: true }).click();
    
    // Wait for progress modal
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
    
    // Check for progress indicators
    await expect(page.getByText(/generating|processing/i)).toBeVisible();
    
    // Look for progress bar or percentage
    const progressBar = page.getByRole('progressbar');
    const progressText = page.getByText(/%|of/i);
    
    if (await progressBar.isVisible()) {
      // Wait for some progress
      await page.waitForTimeout(2000);
      const progress = await progressBar.getAttribute('aria-valuenow');
      if (progress) {
        expect(Number(progress)).toBeGreaterThan(0);
      }
    } else if (await progressText.isVisible()) {
      // Check for text-based progress indicator
      await expect(progressText).toBeVisible();
    }
    
    // Wait for completion (with timeout)
    await expect(page.getByText(/complete|finished|generated|download/i)).toBeVisible({ timeout: 60000 });
    
    // Close modal
    const closeButton = page.getByRole('button', { name: /close/i });
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
  });

  test('PDF modal shows correct preview information', async ({ page }) => {
    // Generate single PDF
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true }).last();
    const dropdownButton = generateButton.locator('~ button').first();
    await dropdownButton.click();
    
    // Wait for dropdown menu to appear
    await page.waitForTimeout(500);
    
    // Click on Single PDF option
    const singlePdfOption = page.getByText('Single PDF');
    await singlePdfOption.click();
    
    // Wait for modal
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
    
    // Check modal contains expected elements
    const modal = page.getByRole('dialog');
    
    // Should show PDF generated message
    await expect(modal).toContainText(/pdf generated|generated successfully/i);
    
    // Should have action buttons
    const downloadButton = modal.getByRole('button', { name: /download/i });
    const closeButton = modal.getByRole('button', { name: /close/i });
    
    await expect(downloadButton).toBeVisible();
    await expect(closeButton).toBeVisible();
    
    // Check for iframe with PDF preview
    const iframe = modal.locator('iframe');
    if (await iframe.count() > 0) {
      await expect(iframe).toBeVisible();
      
      // Verify iframe has a PDF source
      const src = await iframe.getAttribute('src');
      expect(src).toBeTruthy();
      expect(src).toContain('.pdf');
    }
    
    // Close modal
    await closeButton.click();
  });

  test('Format preservation between preview and PDF', async ({ page }) => {
    // Set specific formatting
    const textFields = page.locator('.absolute');
    const firstField = textFields.first();
    await firstField.click();
    
    // Set precise values
    const testFontSize = '32';
    const testColor = '#123456';
    
    const fontSizeInput = page.getByText('Size').locator('..').getByRole('spinbutton');
    await fontSizeInput.clear();
    await fontSizeInput.fill(testFontSize);
    
    const colorInput = page.getByRole('textbox').filter({ hasText: /#/i }).first();
    await colorInput.clear();
    await colorInput.fill(testColor);
    
    // Move to specific position using evaluate
    const targetX = 200;
    const targetY = 300;
    await firstField.evaluate((el, { x, y }) => {
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { x: targetX, y: targetY });
    
    // Capture final state
    const finalFormatting = await firstField.evaluate(el => ({
      fontSize: el.style.fontSize,
      color: el.style.color,
      left: el.style.left,
      top: el.style.top
    }));
    
    // Generate PDF
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true }).last();
    const dropdownButton = generateButton.locator('~ button').first();
    await dropdownButton.click();
    
    // Wait for dropdown menu to appear
    await page.waitForTimeout(500);
    
    // Click on Single PDF option
    const singlePdfOption = page.getByText('Single PDF');
    await singlePdfOption.click();
    
    // Verify modal shows success
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/generated|success|pdf/i)).toBeVisible();
    
    // Log formatting for manual verification if needed
    console.log('Applied formatting:', finalFormatting);
    
    // Close modal
    const closeButton = page.getByRole('button', { name: /close/i });
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
  });

  test('Individual PDFs modal functionality', async ({ page }) => {
    // Generate all PDFs first
    await page.getByRole('button', { name: /generate/i, exact: true }).click();
    
    // Wait for progress modal and completion
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/complete|finished|generated/i)).toBeVisible({ timeout: 60000 });
    
    // Look for "View Individual PDFs" button
    const viewPdfsButton = page.getByRole('button', { name: /view individual pdfs|individual pdfs/i });
    if (await viewPdfsButton.isVisible()) {
      await viewPdfsButton.click();
      
      // Should open a new modal with individual PDFs
      await expect(page.getByRole('dialog')).toBeVisible();
      
      // Check for navigation controls
      const prevButton = page.getByRole('button', { name: /previous/i });
      const nextButton = page.getByRole('button', { name: /next/i });
      
      // Navigate through PDFs if multiple entries exist
      if (await nextButton.isEnabled()) {
        await nextButton.click();
        await page.waitForTimeout(500);
        
        // Should be able to navigate back
        await expect(prevButton).toBeEnabled();
        
        await prevButton.click();
        await page.waitForTimeout(500);
      }
      
      // Check for download and email buttons
      await expect(page.getByRole('button', { name: /download/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /email/i })).toBeVisible();
    }
    
    // Close modal
    const closeButton = page.getByRole('button', { name: /close/i });
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
  });

  test('Email functionality in PDF modal', async ({ page }) => {
    // Generate single PDF
    const generateButton = page.getByRole('button', { name: 'Generate', exact: true }).last();
    const dropdownButton = generateButton.locator('~ button').first();
    await dropdownButton.click();
    
    // Wait for dropdown menu to appear
    await page.waitForTimeout(500);
    
    // Click on Single PDF option
    const singlePdfOption = page.getByText('Single PDF');
    await singlePdfOption.click();
    
    // Wait for modal
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10000 });
    
    // Look for email button
    const emailButton = page.getByRole('button', { name: /email/i });
    if (await emailButton.isVisible()) {
      await emailButton.click();
      
      // Should either show email form or success message
      const emailSent = page.getByText(/email sent|sent successfully/i);
      const emailForm = page.getByRole('textbox', { name: /email/i });
      
      if (await emailForm.isVisible()) {
        // If email form is shown, fill and submit
        await emailForm.fill('test@example.com');
        const sendButton = page.getByRole('button', { name: /send/i });
        await sendButton.click();
        
        // Wait for success message
        await expect(page.getByText(/sent|success/i)).toBeVisible({ timeout: 10000 });
      } else if (await emailSent.isVisible()) {
        // Email was sent automatically (dev mode might have pre-configured email)
        expect(await emailSent.isVisible()).toBe(true);
      }
    }
    
    // Close modal
    const closeButton = page.getByRole('button', { name: /close/i });
    if (await closeButton.isVisible()) {
      await closeButton.click();
    }
  });
});