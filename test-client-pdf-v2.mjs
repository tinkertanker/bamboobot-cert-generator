import { chromium } from 'playwright';

async function testClientPdfGeneration() {
  const browser = await chromium.launch({ 
    headless: false,
    devtools: true 
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Capture all console logs
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    console.log(`[Browser ${msg.type()}]:`, text);
  });

  page.on('pageerror', error => {
    console.error('[Page Error]:', error);
  });

  // Monitor network requests
  page.on('request', request => {
    if (request.url().includes('/api/generate-pdf')) {
      console.log('📡 SERVER API CALLED:', request.url());
    }
    if (request.url().includes('pdf-worker.js')) {
      console.log('🔧 WORKER LOADED:', request.url());
    }
  });

  try {
    console.log('🚀 Starting client-side PDF generation test...\n');
    
    // Navigate to the app
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    console.log('📍 Page loaded\n');

    // Wait for Dev Mode to be fully loaded
    await page.waitForTimeout(3000);

    // Check if Dev Mode is active
    const devModeText = await page.locator('text=Dev Mode').count();
    if (devModeText > 0) {
      console.log('✅ Dev Mode is active\n');
      
      // In Dev Mode, template should auto-load
      await page.waitForTimeout(2000);
    } else {
      console.log('⚠️  Dev Mode not detected, uploading template...\n');
      
      // Need to upload a template
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles('public/template_images/dev-mode-template.jpg');
      await page.waitForTimeout(2000);
    }

    // Check if template image is visible (might be in background)
    const hasBackground = await page.locator('.certificate-preview').count();
    console.log(`Template/Preview present: ${hasBackground > 0 ? '✅' : '❌'}\n`);

    // Check for table data
    const tableRows = await page.locator('tbody tr').count();
    console.log(`📊 Table has ${tableRows} rows of data\n`);

    if (tableRows === 0) {
      console.log('⚠️  No data in table, adding sample data...');
      // Could add data here if needed
    }

    // Try to generate PDF
    console.log('🎯 Looking for Generate PDF button...');
    const generateButtons = await page.locator('button').all();
    for (const btn of generateButtons) {
      const text = await btn.textContent();
      if (text?.includes('Generate PDF')) {
        console.log('✅ Found Generate PDF button:', text);
        
        // Click it
        await btn.click();
        console.log('📍 Clicked Generate PDF button\n');
        break;
      }
    }

    // Wait for modal or PDF generation
    await page.waitForTimeout(3000);

    // Check if modal opened
    const hasModal = await page.locator('[role="dialog"]').count();
    if (hasModal > 0) {
      console.log('✅ Modal opened\n');
      
      // Look for generation options
      const modalText = await page.locator('[role="dialog"]').textContent();
      
      // Check for server-side option
      if (modalText?.includes('Server')) {
        console.log('📡 Server-side option detected in modal\n');
      }
      
      // Try to click Generate in modal
      const modalGenerate = await page.locator('[role="dialog"] button').all();
      for (const btn of modalGenerate) {
        const text = await btn.textContent();
        if (text?.includes('Generate')) {
          console.log('🔄 Clicking Generate in modal...');
          await btn.click();
          break;
        }
      }
    }

    // Wait for generation
    await page.waitForTimeout(5000);

    // Check console logs for generation type
    console.log('\n📊 Analyzing console logs...');
    const clientLogs = consoleLogs.filter(log => log.includes('CLIENT-SIDE'));
    const serverLogs = consoleLogs.filter(log => log.includes('SERVER-SIDE'));
    const workerLogs = consoleLogs.filter(log => log.includes('Worker') || log.includes('worker'));
    
    console.log(`Client-side logs: ${clientLogs.length}`);
    console.log(`Server-side logs: ${serverLogs.length}`);
    console.log(`Worker logs: ${workerLogs.length}`);
    
    if (clientLogs.length > 0) {
      console.log('\n✅ CLIENT-SIDE GENERATION DETECTED!');
      console.log('Sample logs:', clientLogs.slice(0, 3));
    } else if (serverLogs.length > 0) {
      console.log('\n⚠️  SERVER-SIDE GENERATION DETECTED');
      console.log('Sample logs:', serverLogs.slice(0, 3));
    }

    // Check for PDF viewer or download
    const pdfViewers = await page.locator('iframe[src*="blob:"], embed[src*="blob:"]').count();
    const downloadButtons = await page.locator('button:has-text("Download")').count();
    
    console.log(`\nPDF viewers found: ${pdfViewers}`);
    console.log(`Download buttons found: ${downloadButtons}`);

    // Check for errors
    const errors = await page.locator('.text-red-500, [role="alert"]').allTextContents();
    if (errors.length > 0) {
      console.log('\n❌ Errors found:', errors);
    }

    console.log('\n✅ Test completed. Browser will stay open for 30 seconds for inspection.');
    console.log('Check the browser console for detailed logs.\n');
    
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
  }
}

testClientPdfGeneration().catch(console.error);