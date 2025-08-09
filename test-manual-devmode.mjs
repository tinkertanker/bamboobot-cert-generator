import { chromium } from 'playwright';

async function testClientPdfWithManualDevMode() {
  const browser = await chromium.launch({ 
    headless: false,
    devtools: false
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Track generation method
  let clientSideDetected = false;
  let serverSideDetected = false;
  let workerLoaded = false;

  // Monitor console
  page.on('console', msg => {
    const text = msg.text();
    
    if (text.includes('🚀 Using CLIENT-SIDE PDF generation')) {
      clientSideDetected = true;
      console.log('✅ CLIENT-SIDE DETECTED:', text);
    }
    if (text.includes('📡 Using SERVER-SIDE PDF generation')) {
      serverSideDetected = true;
      console.log('⚠️  SERVER-SIDE DETECTED:', text);
    }
    if (text.includes('Dev Mode')) {
      console.log('[Dev Mode]:', text);
    }
  });

  // Monitor network
  page.on('request', request => {
    const url = request.url();
    if (url.includes('pdf-worker.js')) {
      workerLoaded = true;
      console.log('✅ Worker requested');
    }
  });

  try {
    console.log('🚀 Testing Client-Side PDF Generation\n');
    console.log('========================================\n');
    
    // Navigate
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    console.log('📍 Page loaded\n');

    // Manually click Dev Mode checkbox
    console.log('🔧 Clicking Dev Mode checkbox...');
    const devCheckbox = page.locator('#dev-mode-toggle');
    await devCheckbox.click();
    console.log('✅ Dev Mode checkbox clicked\n');

    // Wait for data to load
    console.log('⏳ Waiting for data to load...');
    await page.waitForTimeout(3000);

    // Check table data
    const tableRows = await page.locator('tbody tr').count();
    console.log(`📊 Table rows after Dev Mode: ${tableRows}`);
    
    if (tableRows > 0) {
      console.log('✅ Data loaded successfully!\n');
    } else {
      console.log('❌ No data loaded\n');
    }

    // Look for Generate button (not "Generate PDF", just "Generate")
    console.log('🔍 Looking for Generate button...');
    const generateButton = page.locator('button:has-text("Generate")').first();
    
    try {
      await generateButton.waitFor({ state: 'visible', timeout: 5000 });
      const buttonText = await generateButton.textContent();
      console.log(`✅ Generate button found: "${buttonText}"\n`);
      
      // Click Generate directly (defaults to Individual PDFs)
      console.log('🎯 Clicking Generate button...');
      await generateButton.click();
      
      // Wait for generation
      console.log('⏳ Waiting for PDF generation...\n');
      await page.waitForTimeout(5000);
      
      // Check for modal or results
      const hasModal = await page.locator('[role="dialog"]').count();
      const pdfViewers = await page.locator('iframe[src*="blob:"], embed[src*="blob:"]').count();
      
      console.log('========================================');
      console.log('📊 RESULTS:\n');
      console.log(`Client-side generation: ${clientSideDetected ? '✅ YES' : '❌ NO'}`);
      console.log(`Server-side generation: ${serverSideDetected ? '❌ YES' : '✅ NO'}`);
      console.log(`Worker loaded: ${workerLoaded ? '✅ YES' : '⚠️  NO'}`);
      console.log(`Modal opened: ${hasModal > 0 ? '✅ YES' : '❌ NO'}`);
      console.log(`PDF viewers: ${pdfViewers}`);
      
      // Check for server-side toggle in Dev Mode
      const serverToggle = await page.locator('#server-pdf-toggle').count();
      console.log(`Server-side toggle visible: ${serverToggle > 0 ? '✅ YES (Dev Mode)' : '❌ NO'}`);
      
      if (clientSideDetected && !serverSideDetected) {
        console.log('\n🎉 SUCCESS: Client-side PDF generation is working by default!');
      } else if (serverSideDetected) {
        console.log('\n❌ FAILURE: Server-side was used (should be client-side by default)');
      }
      
    } catch (error) {
      console.log('❌ Generate button error:', error.message);
      
      // Debug: list all visible buttons
      const buttons = await page.locator('button').all();
      console.log('\nVisible buttons:');
      for (const btn of buttons.slice(0, 10)) {
        const text = await btn.textContent();
        const isVisible = await btn.isVisible();
        if (isVisible && text?.trim()) {
          console.log(`  - "${text.trim()}"`);
        }
      }
    }

    // Check for errors
    const errors = await page.locator('.text-red-500, [role="alert"]').allTextContents();
    if (errors.length > 0 && errors.some(e => e.trim())) {
      console.log('\n⚠️  Page errors:', errors.filter(e => e.trim()));
    }

    console.log('\n✅ Test completed. Browser staying open for inspection.');
    console.log('Try clicking Generate manually to see console logs.');
    console.log('Press Ctrl+C to close.\n');
    
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
  }
}

testClientPdfWithManualDevMode().catch(console.error);