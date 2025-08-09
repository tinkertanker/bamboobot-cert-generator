import { chromium } from 'playwright';

async function testPdfWorkflow() {
  const browser = await chromium.launch({ 
    headless: false,
    devtools: false
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Track events
  let clientSideDetected = false;
  let modalOpened = false;
  let pdfGenerated = false;

  // Monitor console
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('🚀 Using CLIENT-SIDE')) {
      clientSideDetected = true;
      console.log('✅ CLIENT-SIDE generation detected');
    }
    if (text.includes('CLIENT-SIDE generation for')) {
      console.log('📝', text);
    }
  });

  try {
    console.log('🧪 Testing Complete PDF Workflow\n');
    console.log('========================================\n');
    
    // Navigate
    await page.goto('http://localhost:3000');
    console.log('📍 Page loaded\n');

    // Enable Dev Mode
    console.log('🔧 Enabling Dev Mode...');
    await page.click('#dev-mode-toggle');
    
    // Wait longer for data to load
    console.log('⏳ Waiting for data to load...');
    await page.waitForTimeout(5000);
    
    // Check data loaded
    const tableRows = await page.locator('tbody tr').count();
    console.log(`📊 Data rows: ${tableRows}\n`);
    
    if (tableRows === 0) {
      throw new Error('No data loaded in Dev Mode');
    }

    // Find and click Generate button
    console.log('🎯 Clicking Generate button...');
    const generateBtn = page.locator('button').filter({ hasText: 'Generate' }).first();
    await generateBtn.click();
    
    // Wait for modal or generation
    console.log('⏳ Waiting for PDF generation...');
    
    // Wait for modal to appear
    try {
      await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
      modalOpened = true;
      console.log('✅ Modal opened\n');
      
      // Check modal title
      const modalTitle = await page.locator('[role="dialog"] h2').textContent();
      console.log(`📄 Modal shows: ${modalTitle}\n`);
      
      // Check if PDFs are listed
      await page.waitForTimeout(2000);
      const pdfCount = await page.locator('[role="dialog"] .font-mono').count();
      console.log(`📚 PDFs in modal: ${pdfCount}`);
      
      if (pdfCount > 0) {
        pdfGenerated = true;
        
        // Test View PDF button
        console.log('\n🔍 Testing View PDF...');
        const viewBtn = page.locator('[role="dialog"] button[title="Open PDF"]').first();
        
        // Set up new page listener
        const [newPage] = await Promise.all([
          context.waitForEvent('page'),
          viewBtn.click()
        ]);
        
        await newPage.waitForLoadState();
        const newUrl = newPage.url();
        console.log(`📄 PDF opened in new tab: ${newUrl.substring(0, 50)}...`);
        
        if (newUrl.startsWith('blob:')) {
          console.log('✅ Blob URL working correctly');
        }
        await newPage.close();
        
        // Test Download button
        console.log('\n💾 Testing Download PDF...');
        const downloadBtn = page.locator('[role="dialog"] button[title="Download PDF"]').first();
        
        // Set up download listener
        const downloadPromise = page.waitForEvent('download');
        await downloadBtn.click();
        const download = await downloadPromise;
        
        console.log(`✅ Download started: ${download.suggestedFilename()}`);
        
        // Test ZIP download
        console.log('\n📦 Testing ZIP Download...');
        const zipBtn = page.locator('button').filter({ hasText: 'Download All' }).first();
        
        const zipDownloadPromise = page.waitForEvent('download');
        await zipBtn.click();
        const zipDownload = await zipDownloadPromise;
        
        console.log(`✅ ZIP download started: ${zipDownload.suggestedFilename()}`);
      }
      
    } catch (error) {
      console.log('❌ Modal did not open:', error.message);
    }

    // Results
    console.log('\n========================================');
    console.log('📊 WORKFLOW TEST RESULTS:\n');
    console.log(`Dev Mode data loaded: ${tableRows > 0 ? '✅' : '❌'}`);
    console.log(`Client-side generation: ${clientSideDetected ? '✅' : '❌'}`);
    console.log(`Modal opened: ${modalOpened ? '✅' : '❌'}`);
    console.log(`PDFs generated: ${pdfGenerated ? '✅' : '❌'}`);
    
    if (clientSideDetected && modalOpened && pdfGenerated) {
      console.log('\n🎉 SUCCESS: Complete workflow working!');
    } else {
      console.log('\n⚠️  Some issues detected');
    }
    
    console.log('\n✅ Test complete. Browser staying open for manual testing.');
    console.log('Press Ctrl+C to close.\n');
    
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    await browser.close();
  }
}

testPdfWorkflow().catch(console.error);