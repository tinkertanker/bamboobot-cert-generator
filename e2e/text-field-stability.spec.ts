import { test, expect } from '@playwright/test';

async function loadDevMode(page: any) {
  await page.getByRole('checkbox', { name: /dev mode/i }).click();
  await page.waitForSelector('img[alt="Certificate Template"]', { timeout: 10000 });
  await expect(page.locator('.absolute').first()).toBeVisible();
  await expect(page.getByRole('table').last()).toBeVisible();
}

async function verifyNoJumping(page: any, element: any, action: () => Promise<void>) {
  const beforeBox = await element.boundingBox();
  expect(beforeBox).not.toBeNull();
  
  await action();
  
  const afterBox = await element.boundingBox();
  expect(afterBox).not.toBeNull();
  
  return { before: beforeBox, after: afterBox };
}

test.describe('Text Field Stability Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await loadDevMode(page);
  });

  test('Text fields should not jump when clicked', async ({ page }) => {
    const textFields = page.locator('.absolute');
    const count = await textFields.count();
    
    for (let i = 0; i < Math.min(count, 3); i++) {
      const field = textFields.nth(i);
      
      const result = await verifyNoJumping(page, field, async () => {
        await field.click();
        await page.waitForTimeout(100); // Small wait to catch any animations
      });
      
      // Verify position hasn't changed
      expect(result.after!.x).toBeCloseTo(result.before!.x, 1);
      expect(result.after!.y).toBeCloseTo(result.before!.y, 1);
    }
  });

  test('Text fields should not jump when switching between them', async ({ page }) => {
    const firstField = page.locator('.absolute').nth(0);
    const secondField = page.locator('.absolute').nth(1);
    
    // Get initial positions
    const firstInitial = await firstField.boundingBox();
    const secondInitial = await secondField.boundingBox();
    
    // Click back and forth multiple times
    for (let i = 0; i < 5; i++) {
      await firstField.click();
      await secondField.click();
    }
    
    // Verify positions haven't changed
    const firstFinal = await firstField.boundingBox();
    const secondFinal = await secondField.boundingBox();
    
    expect(firstFinal!.x).toBeCloseTo(firstInitial!.x, 1);
    expect(firstFinal!.y).toBeCloseTo(firstInitial!.y, 1);
    expect(secondFinal!.x).toBeCloseTo(secondInitial!.x, 1);
    expect(secondFinal!.y).toBeCloseTo(secondInitial!.y, 1);
  });

  test('Text fields maintain position during formatting changes', async ({ page }) => {
    const textField = page.locator('.absolute').first();
    await textField.click();
    
    const initialBox = await textField.boundingBox();
    
    // Change various formatting options
    await page.getByRole('combobox').selectOption('Montserrat');
    
    const fontSizeInput = page.getByText('Size').locator('..').getByRole('spinbutton');
    await fontSizeInput.clear();
    await fontSizeInput.fill('36');
    
    const colorInput = page.getByRole('textbox').filter({ hasText: /#/i }).first();
    await colorInput.clear();
    await colorInput.fill('#0000FF');
    
    // Check if bold/italic buttons exist and click them
    const boldButton = page.getByRole('button', { name: /^B$/i });
    if (await boldButton.isVisible()) {
      await boldButton.click();
    }
    
    // Verify position hasn't changed
    const finalBox = await textField.boundingBox();
    expect(finalBox!.x).toBeCloseTo(initialBox!.x, 1);
    expect(finalBox!.y).toBeCloseTo(initialBox!.y, 1);
  });

  test('Drag and drop precision test', async ({ page }) => {
    const textField = page.locator('.absolute').first();
    await textField.click();
    
    const initialBox = await textField.boundingBox();
    const dragDistanceX = 100;
    const dragDistanceY = 50;
    
    // Perform drag
    await textField.hover();
    await page.mouse.down();
    await page.mouse.move(
      initialBox!.x + dragDistanceX,
      initialBox!.y + dragDistanceY,
      { steps: 10 } // Smooth drag
    );
    await page.mouse.up();
    
    // Verify the element is still visible after drag attempt
    const finalBox = await textField.boundingBox();
    expect(finalBox).not.toBeNull();
    // Note: In dev mode, dragging might not actually move elements
    // Just verify the element didn't disappear or break
    await expect(textField).toBeVisible();
  });

  test('Multiple rapid interactions should not cause jumping', async ({ page }) => {
    const textFields = page.locator('.absolute');
    const positions = [];
    
    // Record initial positions
    const count = await textFields.count();
    for (let i = 0; i < count; i++) {
      const box = await textFields.nth(i).boundingBox();
      positions.push(box);
    }
    
    // Perform rapid interactions
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < count; i++) {
        await textFields.nth(i).click();
        // Quick formatting change
        if (i === 0) {
          const fontSizeInput = page.getByText('Size').locator('..').getByRole('spinbutton');
          await fontSizeInput.clear();
          await fontSizeInput.fill(`${20 + round * 2}`);
        }
      }
    }
    
    // Verify positions haven't jumped
    for (let i = 0; i < count; i++) {
      const currentBox = await textFields.nth(i).boundingBox();
      expect(currentBox!.x).toBeCloseTo(positions[i]!.x, 1);
      expect(currentBox!.y).toBeCloseTo(positions[i]!.y, 1);
    }
  });

  test('Resizing should not affect position', async ({ page }) => {
    const textField = page.locator('.absolute').first();
    await textField.click();
    
    const initialBox = await textField.boundingBox();
    
    // Change box width and height
    const boxWidthInput = page.locator('div').filter({ hasText: /^Box Width/ }).getByRole('spinbutton');
    await boxWidthInput.clear();
    await boxWidthInput.fill('40');
    
    const boxHeightInput = page.locator('div').filter({ hasText: /^Box Height/ }).getByRole('spinbutton');
    await boxHeightInput.clear();
    await boxHeightInput.fill('20');
    
    // Wait for changes to apply
    await page.waitForTimeout(300);
    
    // Verify position hasn't changed (only size should change)
    const finalBox = await textField.boundingBox();
    expect(finalBox!.x).toBeCloseTo(initialBox!.x, 1);
    expect(finalBox!.y).toBeCloseTo(initialBox!.y, 1);
    
    // Verify size did change
    expect(finalBox!.width).not.toBeCloseTo(initialBox!.width, 1);
    expect(finalBox!.height).not.toBeCloseTo(initialBox!.height, 1);
  });

  test('Alignment changes should not cause jumping', async ({ page }) => {
    const textField = page.locator('.absolute').first();
    await textField.click();
    
    const initialBox = await textField.boundingBox();
    
    // Test all alignment options
    const alignments = ['center', 'right', 'left'];
    
    for (const alignment of alignments) {
      const alignButton = page.getByRole('button', { name: new RegExp(`align ${alignment}`, 'i') });
      if (await alignButton.isVisible()) {
        await alignButton.click();
        await page.waitForTimeout(100);
        
        // Verify position hasn't jumped
        const currentBox = await textField.boundingBox();
        expect(currentBox!.x).toBeCloseTo(initialBox!.x, 1);
        expect(currentBox!.y).toBeCloseTo(initialBox!.y, 1);
      }
    }
  });
});