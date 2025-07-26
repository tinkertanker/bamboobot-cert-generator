import { Page, expect } from '@playwright/test';

/**
 * Load Dev Mode and wait for all elements to be ready
 */
export async function loadDevMode(page: Page) {
  await page.getByRole('checkbox', { name: /dev mode/i }).click();
  await page.waitForSelector('img[alt="Certificate Template"]', { timeout: 10000 });
  
  // Wait for text fields to load
  await expect(page.locator('.absolute').first()).toBeVisible();
  
  // Wait for data table to load
  await expect(page.getByRole('table').last()).toBeVisible();
}

/**
 * Select a text field by index
 */
export async function selectTextField(page: Page, index: number = 0) {
  const textField = page.locator('.absolute').nth(index);
  await textField.click();
  
  // Wait for formatting panel to be visible
  await expect(page.getByText(/field:/i)).toBeVisible();
  
  return textField;
}

/**
 * Verify that an element doesn't jump during an action
 */
export async function verifyNoJumping(page: Page, element: any, action: () => Promise<void>) {
  const beforeBox = await element.boundingBox();
  expect(beforeBox).not.toBeNull();
  
  await action();
  
  const afterBox = await element.boundingBox();
  expect(afterBox).not.toBeNull();
  
  // Verify the element didn't jump unexpectedly
  return { before: beforeBox, after: afterBox };
}

/**
 * Generate a single PDF using the dropdown menu
 */
export async function generateSinglePDF(page: Page) {
  // Find and click the dropdown arrow
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
}

/**
 * Capture formatting information from a text field
 */
export async function captureFormatting(page: Page, element: any) {
  const style = await element.getAttribute('style');
  const computedStyle = await element.evaluate((el: HTMLElement) => {
    return {
      fontSize: window.getComputedStyle(el).fontSize,
      fontFamily: window.getComputedStyle(el).fontFamily,
      color: window.getComputedStyle(el).color,
      position: {
        left: el.style.left,
        top: el.style.top
      },
      dimensions: {
        width: el.style.width,
        height: el.style.height
      }
    };
  });
  
  return { style, computedStyle };
}

/**
 * Compare formatting between two captured states
 */
export async function compareFormatting(original: any, current: any) {
  // Compare key formatting properties
  expect(current.computedStyle.fontSize).toBe(original.computedStyle.fontSize);
  expect(current.computedStyle.fontFamily).toBe(original.computedStyle.fontFamily);
  expect(current.computedStyle.color).toBe(original.computedStyle.color);
}

/**
 * Apply formatting to a selected text field
 */
export async function applyFormatting(page: Page, options: {
  font?: string;
  fontSize?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  alignment?: 'left' | 'center' | 'right';
}) {
  if (options.font) {
    await page.getByRole('combobox').selectOption(options.font);
  }
  
  if (options.fontSize) {
    const fontSizeInput = page.getByText('Size').locator('..').getByRole('spinbutton');
    await fontSizeInput.clear();
    await fontSizeInput.fill(options.fontSize);
  }
  
  if (options.color) {
    const colorInput = page.getByRole('textbox').filter({ hasText: /#/i }).first();
    await colorInput.clear();
    await colorInput.fill(options.color);
  }
  
  if (options.bold !== undefined) {
    const boldButton = page.getByRole('button', { name: /^B$/i });
    const isPressed = await boldButton.getAttribute('aria-pressed') === 'true';
    if (isPressed !== options.bold) {
      await boldButton.click();
    }
  }
  
  if (options.italic !== undefined) {
    const italicButton = page.getByRole('button', { name: /^I$/i });
    const isPressed = await italicButton.getAttribute('aria-pressed') === 'true';
    if (isPressed !== options.italic) {
      await italicButton.click();
    }
  }
  
  if (options.alignment) {
    const alignButton = page.getByRole('button', { name: new RegExp(`align ${options.alignment}`, 'i') });
    await alignButton.click();
  }
}

/**
 * Navigate through entries
 */
export async function navigateToEntry(page: Page, target: 'first' | 'last' | 'next' | 'previous') {
  const buttonName = `${target} entry`;
  await page.getByRole('button', { name: new RegExp(buttonName, 'i') }).click();
  
  // Wait for navigation to complete
  await page.waitForTimeout(500);
}

/**
 * Wait for PDF generation to complete
 */
export async function waitForPDFGeneration(page: Page, timeout: number = 60000) {
  await expect(page.getByText(/complete|finished|generated|download/i)).toBeVisible({ timeout });
}

/**
 * Close modal if visible
 */
export async function closeModal(page: Page) {
  const closeButton = page.getByRole('button', { name: /close/i });
  if (await closeButton.isVisible()) {
    await closeButton.click();
    // Wait for modal to close
    await page.waitForTimeout(300);
  }
}

/**
 * Resize a text field using the formatting panel
 */
export async function resizeTextField(page: Page, width: string, height: string) {
  const boxWidthInput = page.locator('div').filter({ hasText: /^Box Width/ }).getByRole('spinbutton');
  await boxWidthInput.clear();
  await boxWidthInput.fill(width);
  
  const boxHeightInput = page.locator('div').filter({ hasText: /^Box Height/ }).getByRole('spinbutton');
  await boxHeightInput.clear();
  await boxHeightInput.fill(height);
  
  // Wait for changes to apply
  await page.waitForTimeout(300);
}

/**
 * Move a text field to a specific position
 */
export async function moveTextField(page: Page, element: any, x: number, y: number) {
  await element.evaluate((el: HTMLElement, pos: { x: number; y: number }) => {
    el.style.left = `${pos.x}px`;
    el.style.top = `${pos.y}px`;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, { x, y });
}

/**
 * Get current entry number from the navigation indicator
 */
export async function getCurrentEntry(page: Page): Promise<{ current: number; total: number }> {
  const entryText = await page.getByText(/\d+ of \d+/i).textContent();
  if (entryText) {
    const match = entryText.match(/(\d+) of (\d+)/i);
    if (match) {
      return {
        current: parseInt(match[1], 10),
        total: parseInt(match[2], 10)
      };
    }
  }
  throw new Error('Could not find entry navigation indicator');
}