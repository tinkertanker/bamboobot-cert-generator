import { chromium } from 'playwright';

async function testClientPdfGeneration() {
  const browser = await chromium.launch({ 
    headless: false,
    devtools: true 
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Enable console logging
  page.on('console', msg => {
    console.log(`[Browser ${msg.type()}]:`, msg.text());
  });

  page.on('pageerror', error => {
    console.error('[Page Error]:', error);
  });

  try {
    console.log('🚀 Starting client-side PDF generation test...\n');
    
    // Navigate to the app
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    console.log('📍 Page loaded, waiting for Dev Mode...');
    
    // Wait for Dev Mode to initialize
    await page.waitForSelector('text=Dev Mode', { timeout: 10000 });
    console.log('✅ Dev Mode detected\n');

    // Check if template is loaded
    const templateImage = await page.locator('.image-container img').first();
    await templateImage.waitFor({ state: 'visible' });
    console.log('✅ Template image loaded\n');

    // Check for data in table
    const tableRows = await page.locator('tbody tr').count();
    console.log(`📊 Table has ${tableRows} rows of data\n`);

    // Open Generate PDF modal
    console.log('🎯 Opening Generate PDF modal...');
    const generateButton = page.locator('button:has-text("Generate PDF")').first();
    await generateButton.click();
    
    // Wait for modal to open
    await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
    console.log('✅ Modal opened\n');

    // Check if client-side is default
    const modalContent = await page.locator('[role="dialog"]').textContent();
    console.log('📋 Modal content includes:', modalContent.substring(0, 200) + '...\n');

    // Look for server-side option (should only be in Dev Mode)
    const serverOption = await page.locator('text=/Use Server-Side/i').count();
    if (serverOption > 0) {
      console.log('✅ Server-side option found (Dev Mode only)\n');
    } else {
      console.log('⚠️  No server-side option found\n');
    }

    // Click Generate to trigger client-side generation
    console.log('🔄 Triggering PDF generation...');
    const modalGenerateButton = page.locator('[role="dialog"] button:has-text("Generate")').first();
    
    // Set up request interception to detect if server API is called
    let serverCalled = false;
    page.on('request', request => {
      if (request.url().includes('/api/generate-pdf')) {
        serverCalled = true;
        console.log('⚠️  Server API called:', request.url());
      }
    });

    // Click generate
    await modalGenerateButton.click();
    
    // Wait a moment for generation to start
    await page.waitForTimeout(2000);

    // Check console logs for client-side indicator
    const logs = await page.evaluate(() => {
      // Check if any recent console logs indicate client-side generation
      return window.localStorage.getItem('lastPdfGenerationType') || 'unknown';
    });

    // Check if PDF was generated
    const pdfGenerated = await page.locator('text=/View PDF|Download PDF/i').count();
    
    console.log('\n📊 Results:');
    console.log('-------------------');
    console.log(`Server API called: ${serverCalled ? '❌ YES (should be NO)' : '✅ NO (correct)'}`);
    console.log(`PDF generated: ${pdfGenerated > 0 ? '✅ YES' : '❌ NO'}`);
    console.log(`Generation type: ${logs}`);

    // Try to detect if worker was used
    const workerActive = await page.evaluate(() => {
      return typeof Worker !== 'undefined' && window.performance.getEntriesByType('resource')
        .some(e => e.name.includes('pdf-worker.js'));
    });
    console.log(`Worker loaded: ${workerActive ? '✅ YES' : '❌ NO'}`);

    // Check for any error messages
    const errorMessages = await page.locator('.text-red-500, [role="alert"]').count();
    if (errorMessages > 0) {
      const errors = await page.locator('.text-red-500, [role="alert"]').allTextContents();
      console.log('\n⚠️  Errors found:', errors);
    }

    console.log('\n✅ Test completed. Check browser console for CLIENT-SIDE or SERVER-SIDE logs.');
    
    // Keep browser open for manual inspection
    console.log('\n👀 Browser will stay open for manual inspection. Press Ctrl+C to exit.');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
  }
}

testClientPdfGeneration().catch(console.error);