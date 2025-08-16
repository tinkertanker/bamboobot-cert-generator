import { test } from '@playwright/test';

test.describe('Onboarding Screenshots', () => {

  test('capture welcome screen and onboarding flow', async ({ page }) => {
    // Set viewport to a standard desktop size
    await page.setViewportSize({ width: 1440, height: 900 });
    
    // Navigate to the app
    await page.goto('http://localhost:3000');
    
    // Wait for the welcome screen to appear
    await page.waitForSelector('text="Welcome to Bamboobot Certificate Generator!"', {
      timeout: 10000
    });
    
    // Take screenshot of the welcome screen
    await page.screenshot({
      path: 'screenshots/01-welcome-screen.png',
      fullPage: false
    });
    
    // Click on "Interactive Tour" button to open the onboarding modal
    const tourButton = page.locator('button:has-text("Interactive Tour")').first();
    await tourButton.click();
    
    // Wait for the onboarding modal
    await page.waitForSelector('text="Welcome to Bamboobot Certificate Generator! 🎉"', {
      timeout: 5000
    });
    
    // Take screenshot of the first onboarding step
    await page.screenshot({
      path: 'screenshots/02-onboarding-step-1.png',
      fullPage: false
    });
    
    // Click Next to go to step 2
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(500); // Wait for animation
    
    // Take screenshot of step 2 (Upload Template)
    await page.screenshot({
      path: 'screenshots/03-onboarding-step-2-upload.png',
      fullPage: false
    });
    
    // Click Next to go to step 3
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(500);
    
    // Take screenshot of step 3 (Add Data)
    await page.screenshot({
      path: 'screenshots/04-onboarding-step-3-data.png',
      fullPage: false
    });
    
    // Click Next to go to step 4
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(500);
    
    // Take screenshot of step 4 (Position Text)
    await page.screenshot({
      path: 'screenshots/05-onboarding-step-4-position.png',
      fullPage: false
    });
    
    // Click Next to go to step 5
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(500);
    
    // Take screenshot of step 5 (Format Text)
    await page.screenshot({
      path: 'screenshots/06-onboarding-step-5-format.png',
      fullPage: false
    });
    
    // Click Next to go to step 6
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(500);
    
    // Take screenshot of step 6 (Generate & Send)
    await page.screenshot({
      path: 'screenshots/07-onboarding-step-6-generate.png',
      fullPage: false
    });
    
    // Click Next to go to final step
    await page.click('button:has-text("Next")');
    await page.waitForTimeout(500);
    
    // Take screenshot of final step (Ready to Start)
    await page.screenshot({
      path: 'screenshots/08-onboarding-step-7-ready.png',
      fullPage: false
    });
    
    // Close modal and start the tour
    await page.click('button:has-text("Start Interactive Tour")');
    
    // Wait for driver.js tour to start
    await page.waitForSelector('.driver-popover', {
      timeout: 5000
    });
    
    // Take screenshot of the interactive tour
    await page.screenshot({
      path: 'screenshots/09-interactive-tour.png',
      fullPage: false
    });
    
    // Close the tour
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    // Now test with sample data - reload and choose sample data option
    await page.reload();
    await page.waitForSelector('text="Welcome to Bamboobot Certificate Generator!"');
    
    // Click "Try Sample Data"
    const sampleButton = page.locator('button:has-text("Try Sample Data")').first();
    await sampleButton.click();
    
    // Wait for the main app to load with sample data
    await page.waitForSelector('.bg-card', { timeout: 5000 });
    await page.waitForTimeout(1000); // Let everything load
    
    // Take screenshot of app with sample data loaded
    await page.screenshot({
      path: 'screenshots/10-app-with-sample-data.png',
      fullPage: false
    });
    
    // Click the Tutorial button in header
    await page.click('button:has-text("Tutorial")');
    
    // Wait for onboarding modal to reopen
    await page.waitForSelector('text="Welcome to Bamboobot Certificate Generator! 🎉"');
    
    // Take screenshot showing tutorial can be accessed again
    await page.screenshot({
      path: 'screenshots/11-tutorial-button-access.png',
      fullPage: false
    });
  });
  
  test('capture mobile responsive view', async ({ page, context }) => {
    // Clear localStorage
    await context.clearCookies();
    await page.addInitScript(() => {
      localStorage.clear();
    });
    
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone X size
    
    // Navigate to the app
    await page.goto('http://localhost:3000');
    
    // Take screenshot of mobile warning or mobile view
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: 'screenshots/12-mobile-view.png',
      fullPage: false
    });
  });
});