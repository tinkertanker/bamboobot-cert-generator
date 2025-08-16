import { test, expect } from '@playwright/test';

test.describe('Capture Key Onboarding Screenshots', () => {
  test('capture welcome and modal screens', async ({ page, context }) => {
    // Clear localStorage to ensure we see the onboarding
    await context.clearCookies();
    await page.addInitScript(() => {
      localStorage.clear();
    });
    
    // Set viewport
    await page.setViewportSize({ width: 1440, height: 900 });
    
    // Navigate to the app
    await page.goto('http://localhost:3000');
    
    // Wait for welcome screen
    await page.waitForSelector('h1:has-text("Welcome to Bamboobot")', {
      timeout: 10000
    });
    
    // Screenshot 1: Welcome Screen
    await page.screenshot({
      path: 'screenshots/welcome-screen-full.png',
      fullPage: false
    });
    
    // Try clicking the onboarding modal button
    // Find the button in the Quick Start Options section
    const buttons = await page.locator('.grid button').all();
    if (buttons.length > 0) {
      // Click the first button (Interactive Tour)
      await buttons[0].click();
      await page.waitForTimeout(1000);
      
      // Check if modal opened
      const modalVisible = await page.locator('.fixed.inset-0').isVisible();
      if (modalVisible) {
        await page.screenshot({
          path: 'screenshots/onboarding-modal.png',
          fullPage: false
        });
      }
    }
    
    // Close any modals and get back to welcome
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Click the sample data button
    const sampleButtons = await page.locator('button').filter({ hasText: /sample/i }).all();
    if (sampleButtons.length > 0) {
      await sampleButtons[0].click();
      await page.waitForTimeout(2000);
      
      // Screenshot of app with sample data
      await page.screenshot({
        path: 'screenshots/app-with-sample.png',
        fullPage: false
      });
    }
  });
  
  test('capture tutorial button', async ({ page }) => {
    // Set localStorage to skip onboarding
    await page.addInitScript(() => {
      localStorage.setItem('bamboobot_onboarding_completed', 'true');
    });
    
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:3000');
    
    // Wait for main app to load
    await page.waitForSelector('header', { timeout: 10000 });
    
    // Screenshot showing tutorial button in header
    await page.screenshot({
      path: 'screenshots/main-app-with-tutorial-button.png',
      fullPage: false
    });
    
    // Click tutorial button if it exists
    const tutorialButton = await page.locator('button:has-text("Tutorial")').first();
    if (await tutorialButton.isVisible()) {
      await tutorialButton.click();
      await page.waitForTimeout(1000);
      
      await page.screenshot({
        path: 'screenshots/tutorial-modal-reopened.png',
        fullPage: false
      });
    }
  });
});