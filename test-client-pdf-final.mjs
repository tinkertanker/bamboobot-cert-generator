import { chromium } from 'playwright';

async function testClientPdfGeneration() {
  const browser = await chromium.launch({ 
    headless: false,
    devtools: false  // Don't auto-open devtools
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Track important events
  let serverApiCalled = false;
  let workerLoaded = false;
  let clientSideDetected = false;
  let serverSideDetected = false;

  // Capture console logs
  page.on('console', msg => {
    const text = msg.text();
    
    // Check for key indicators
    if (text.includes('🚀 Using CLIENT-SIDE PDF generation')) {
      clientSideDetected = true;
      console.log('✅ CLIENT-SIDE GENERATION DETECTED!');
    }
    if (text.includes('📡 Using SERVER-SIDE PDF generation')) {
      serverSideDetected = true;
      console.log('⚠️  SERVER-SIDE GENERATION DETECTED');
    }
    
    // Log important messages
    if (text.includes('PDF') || text.includes('Worker') || text.includes('client') || text.includes('server')) {
      console.log(`[Browser]:`, text);
    }
  });

  // Monitor network
  page.on('request', request => {
    const url = request.url();
    if (url.includes('/api/generate-pdf')) {
      serverApiCalled = true;
      console.log('⚠️  SERVER API CALLED:', url);
    }
    if (url.includes('pdf-worker.js')) {
      workerLoaded = true;
      console.log('✅ WORKER LOADED:', url);
    }
  });

  page.on('response', response => {
    const url = response.url();
    if (url.includes('pdf-worker.js') && response.status() === 200) {
      console.log('✅ Worker loaded successfully');
    }
  });

  try {
    console.log('🚀 Testing Client-Side PDF Generation\n');
    console.log('========================================\n');
    
    // Navigate to app
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    console.log('📍 Page loaded\n');

    // Wait for Dev Mode to fully initialize
    console.log('⏳ Waiting for Dev Mode to initialize...');
    await page.waitForTimeout(5000); // Give Dev Mode time to load data and template

    // Check Dev Mode status
    const devModeIndicator = await page.locator('text=Dev Mode').count();
    console.log(`Dev Mode indicator: ${devModeIndicator > 0 ? '✅ Present' : '❌ Missing'}\n`);

    // Check for table data
    const tableRows = await page.locator('tbody tr').count();
    console.log(`📊 Table rows: ${tableRows}`);
    
    if (tableRows === 0) {
      console.log('⚠️  No data loaded - Dev Mode may not be working\n');
    } else {
      console.log('✅ Data loaded successfully\n');
    }

    // Check if template/certificate preview is visible
    const certificatePreview = await page.locator('.certificate-preview, .image-container').count();
    console.log(`Certificate preview: ${certificatePreview > 0 ? '✅ Present' : '❌ Missing'}\n`);

    // Look for Generate PDF button
    console.log('🔍 Looking for Generate PDF button...');
    const generateButton = page.locator('button:has-text("Generate PDF")').first();
    
    try {
      await generateButton.waitFor({ state: 'visible', timeout: 5000 });
      console.log('✅ Generate PDF button found\n');
      
      // Click Generate PDF
      console.log('🎯 Clicking Generate PDF...');
      await generateButton.click();
      
      // Wait for modal
      await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
      console.log('✅ Modal opened\n');
      
      // Check modal content for server option
      const modalContent = await page.locator('[role="dialog"]').textContent();
      if (modalContent?.includes('Server')) {
        console.log('📡 Server-side option found in modal (Dev Mode feature)\n');
      }
      
      // Find and click Generate in modal
      const modalGenerateBtn = page.locator('[role="dialog"] button').filter({ hasText: /Generate/i }).first();
      
      console.log('🔄 Starting PDF generation...');
      await modalGenerateBtn.click();
      
      // Wait for generation to complete
      console.log('⏳ Waiting for PDF generation...\n');
      await page.waitForTimeout(5000);
      
      // Check for success indicators
      const pdfViewer = await page.locator('iframe[src*="blob:"], embed[src*="blob:"]').count();
      const downloadButton = await page.locator('button:has-text("Download")').count();
      const viewPdfButton = await page.locator('button:has-text("View PDF")').count();
      
      console.log('========================================');
      console.log('📊 RESULTS:\n');
      console.log(`Client-side detected: ${clientSideDetected ? '✅ YES' : '❌ NO'}`);
      console.log(`Server-side detected: ${serverSideDetected ? '✅ YES (wrong!)' : '✅ NO (correct)'}`);
      console.log(`Worker loaded: ${workerLoaded ? '✅ YES' : '❌ NO'}`);
      console.log(`Server API called: ${serverApiCalled ? '❌ YES (wrong!)' : '✅ NO (correct)'}`);
      console.log(`PDF viewer present: ${pdfViewer > 0 ? '✅ YES' : '❌ NO'}`);
      console.log(`Download button: ${downloadButton > 0 ? '✅ YES' : '❌ NO'}`);
      console.log(`View PDF button: ${viewPdfButton > 0 ? '✅ YES' : '❌ NO'}`);
      
      // Final verdict
      console.log('\n========================================');
      if (clientSideDetected && !serverApiCalled && workerLoaded) {
        console.log('🎉 SUCCESS: Client-side PDF generation is working!');
      } else if (serverSideDetected || serverApiCalled) {
        console.log('❌ FAILURE: Still using server-side generation');
      } else {
        console.log('⚠️  INCONCLUSIVE: Could not determine generation method');
      }
      
    } catch (error) {
      console.log('❌ Generate button not found or error:', error.message);
    }

    // Check for errors
    const errors = await page.locator('.text-red-500, [role="alert"]').allTextContents();
    if (errors.length > 0 && errors.some(e => e.trim())) {
      console.log('\n⚠️  Errors found:', errors.filter(e => e.trim()));
    }

    console.log('\n✅ Test completed. Browser staying open for manual inspection.');
    console.log('Press Ctrl+C to close.\n');
    
    // Keep open for manual testing
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
  }
}

testClientPdfGeneration().catch(console.error);