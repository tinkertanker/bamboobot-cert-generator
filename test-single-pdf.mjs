#!/usr/bin/env node

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = 'http://localhost:3000';

async function testSinglePdfGeneration() {
  console.log('🧪 Testing Single PDF Generation (Client-Side)...\n');

  try {
    // Test data - simple two-row example
    const data = [
      {
        Name: { text: 'John Doe', color: [0, 0, 0] },
        Title: { text: 'Certificate of Achievement', color: [0.2, 0.3, 0.8] },
        Date: { text: 'January 1, 2024', color: [0, 0, 0] }
      },
      {
        Name: { text: 'Jane Smith', color: [0, 0, 0] },
        Title: { text: 'Certificate of Excellence', color: [0.2, 0.3, 0.8] },
        Date: { text: 'January 2, 2024', color: [0, 0, 0] }
      }
    ];

    const positions = {
      Name: { x: 0.5, y: 0.4, fontSize: 24, alignment: 'center' },
      Title: { x: 0.5, y: 0.5, fontSize: 18, alignment: 'center' },
      Date: { x: 0.5, y: 0.6, fontSize: 14, alignment: 'center' }
    };

    const requestBody = {
      mode: 'single',
      templateFilename: 'dev-mode-template.pdf',
      data,
      positions,
      uiContainerDimensions: { width: 800, height: 600 }
    };

    console.log('📤 Sending request to generate single PDF...');
    console.log('   Mode: single');
    console.log('   Rows: 2');
    console.log('   Template: dev-mode-template.pdf\n');

    const response = await axios.post(`${BASE_URL}/api/generate`, requestBody, {
      headers: {
        'Content-Type': 'application/json',
      }
    });

    const result = response.data;
    console.log('✅ Single PDF generated successfully!');
    console.log('   Output:', result.outputPath || result.url);

    // Try to download the PDF
    if (result.outputPath || result.url) {
      const pdfUrl = result.outputPath || result.url;
      const fullUrl = pdfUrl.startsWith('http') ? pdfUrl : `${BASE_URL}${pdfUrl}`;
      
      console.log('\n📥 Attempting to download PDF...');
      const pdfResponse = await axios.get(fullUrl, { responseType: 'arraybuffer' });
      
      const buffer = pdfResponse.data;
      const outputPath = path.join(__dirname, 'test-output-single.pdf');
      await fs.writeFile(outputPath, Buffer.from(buffer));
      console.log('✅ PDF downloaded successfully!');
      console.log('   Saved to:', outputPath);
      console.log('   Size:', (buffer.byteLength / 1024).toFixed(2), 'KB');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
console.log('🚀 Single PDF Generation Test\n');
console.log('This test generates a merged PDF with multiple certificates.\n');

testSinglePdfGeneration().catch(console.error);