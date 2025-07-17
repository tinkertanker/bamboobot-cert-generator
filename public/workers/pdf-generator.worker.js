// PDF Generation Web Worker
// This worker handles CPU-intensive PDF generation tasks off the main thread

importScripts('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');
importScripts('https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js');

// Cache for fonts to avoid repeated loading
const fontCache = new Map();

// Helper function to convert RGB array to pdf-lib rgb
function rgbFromArray(color) {
  const { rgb } = PDFLib;
  return rgb(color[0], color[1], color[2]);
}

// Helper function to load font from URL
async function loadFontFromUrl(url) {
  if (fontCache.has(url)) {
    return fontCache.get(url);
  }
  
  const response = await fetch(url);
  const fontBytes = await response.arrayBuffer();
  fontCache.set(url, new Uint8Array(fontBytes));
  return fontCache.get(url);
}

// Main PDF generation function
async function generatePdfInWorker(data) {
  const {
    templateBytes,
    entryData,
    positions,
    uiContainerDimensions,
    fontUrls
  } = data;

  const { PDFDocument, StandardFonts } = PDFLib;
  
  // Load template
  const templateDoc = await PDFDocument.load(templateBytes);
  
  // Create new PDF
  const pdf = await PDFDocument.create();
  
  // Copy template page
  const [templatePage] = await pdf.copyPages(templateDoc, [0]);
  pdf.addPage(templatePage);
  
  // Embed standard fonts
  const standardFonts = {
    helvetica: await pdf.embedFont(StandardFonts.Helvetica),
    helveticaBold: await pdf.embedFont(StandardFonts.HelveticaBold),
    helveticaOblique: await pdf.embedFont(StandardFonts.HelveticaOblique),
    helveticaBoldOblique: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    times: await pdf.embedFont(StandardFonts.TimesRoman),
    timesBold: await pdf.embedFont(StandardFonts.TimesRomanBold),
    timesOblique: await pdf.embedFont(StandardFonts.TimesRomanItalic),
    timesBoldOblique: await pdf.embedFont(StandardFonts.TimesRomanBoldItalic),
    courier: await pdf.embedFont(StandardFonts.Courier),
    courierBold: await pdf.embedFont(StandardFonts.CourierBold),
    courierOblique: await pdf.embedFont(StandardFonts.CourierOblique),
    courierBoldOblique: await pdf.embedFont(StandardFonts.CourierBoldOblique),
  };
  
  // Check if custom fonts are needed
  const customFonts = ['Montserrat', 'Poppins', 'SourceSansPro', 'Nunito', 'GreatVibes'];
  const needsCustomFonts = customFonts.some(fontName => 
    Object.values(positions).some(pos => pos.font === fontName) || 
    Object.values(entryData).some(val => val && typeof val === 'object' && val.font === fontName)
  );
  
  // Load custom fonts if needed
  const customFontsEmbedded = {};
  if (needsCustomFonts && fontUrls) {
    pdf.registerFontkit(fontkit);
    
    // Load fonts in parallel for better performance
    const fontLoadPromises = Object.entries(fontUrls).map(async ([key, url]) => {
      const fontBytes = await loadFontFromUrl(url);
      customFontsEmbedded[key] = await pdf.embedFont(fontBytes);
    });
    
    await Promise.all(fontLoadPromises);
  }
  
  const page = pdf.getPages()[0];
  const { width, height } = page.getSize();
  
  // Add text to the page
  for (const [key, position] of Object.entries(positions)) {
    const entryValue = entryData[key];
    if (entryValue) {
      const x = position.x * width;
      
      // Use color from entry or default to black
      const color = entryValue.color || [0, 0, 0];
      const rgbColor = rgbFromArray(color);
      
      // Calculate font size
      const baseFontSize = position.fontSize || 20;
      let fontSize = baseFontSize;
      
      if (entryValue.uiMeasurements && uiContainerDimensions) {
        const scaleFactor = width / uiContainerDimensions.width;
        fontSize = fontSize * scaleFactor;
      }
      
      // Determine font
      const fontFamily = entryValue.font || position.font || 'Helvetica';
      const isBold = entryValue.bold !== undefined ? entryValue.bold : position.bold;
      const isOblique = entryValue.oblique !== undefined ? entryValue.oblique : position.oblique;
      
      let font;
      switch (fontFamily) {
        case 'Helvetica':
          font = isBold && isOblique ? standardFonts.helveticaBoldOblique :
                 isBold ? standardFonts.helveticaBold :
                 isOblique ? standardFonts.helveticaOblique :
                 standardFonts.helvetica;
          break;
        case 'Times':
          font = isBold && isOblique ? standardFonts.timesBoldOblique :
                 isBold ? standardFonts.timesBold :
                 isOblique ? standardFonts.timesOblique :
                 standardFonts.times;
          break;
        case 'Courier':
          font = isBold && isOblique ? standardFonts.courierBoldOblique :
                 isBold ? standardFonts.courierBold :
                 isOblique ? standardFonts.courierOblique :
                 standardFonts.courier;
          break;
        case 'Montserrat':
          font = isBold ? customFontsEmbedded.MontserratBold : customFontsEmbedded.Montserrat;
          break;
        case 'Poppins':
          font = isBold && isOblique ? customFontsEmbedded.PoppinsBoldItalic :
                 isBold ? customFontsEmbedded.PoppinsBold :
                 isOblique ? customFontsEmbedded.PoppinsItalic :
                 customFontsEmbedded.Poppins;
          break;
        case 'SourceSansPro':
          font = isBold && isOblique ? customFontsEmbedded.SourceSansProBoldItalic :
                 isBold ? customFontsEmbedded.SourceSansProBold :
                 isOblique ? customFontsEmbedded.SourceSansProItalic :
                 customFontsEmbedded.SourceSansPro;
          break;
        case 'Nunito':
          font = isBold && isOblique ? customFontsEmbedded.NunitoBoldItalic :
                 isBold ? customFontsEmbedded.NunitoBold :
                 isOblique ? customFontsEmbedded.NunitoItalic :
                 customFontsEmbedded.Nunito;
          break;
        case 'GreatVibes':
          font = customFontsEmbedded.GreatVibes;
          break;
        default:
          font = standardFonts.helvetica;
      }
      
      // Handle text alignment
      const alignment = position.alignment || 'left';
      let adjustedX = x;
      
      if (alignment !== 'left' && font) {
        const textWidth = font.widthOfTextAtSize(entryValue.text, fontSize);
        if (alignment === 'center') {
          adjustedX = x - (textWidth / 2);
        } else if (alignment === 'right') {
          adjustedX = x - textWidth;
        }
      }
      
      // Convert y coordinate
      const y = height - (position.y * height);
      
      page.drawText(entryValue.text, {
        x: adjustedX,
        y: y,
        size: fontSize,
        font: font,
        color: rgbColor,
      });
    }
  }
  
  // Save PDF bytes
  const pdfBytes = await pdf.save();
  return pdfBytes;
}

// Message handler
self.addEventListener('message', async (event) => {
  const { type, id, data } = event.data;
  
  try {
    switch (type) {
      case 'GENERATE_PDF':
        // Send progress update
        self.postMessage({
          type: 'PROGRESS',
          id,
          progress: 0,
          message: 'Starting PDF generation...'
        });
        
        const pdfBytes = await generatePdfInWorker(data);
        
        // Send result
        self.postMessage({
          type: 'SUCCESS',
          id,
          result: pdfBytes
        }, [pdfBytes.buffer]); // Transfer ownership for performance
        break;
        
      case 'BATCH_GENERATE':
        const { entries, ...commonData } = data;
        const results = [];
        
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          
          // Send progress
          self.postMessage({
            type: 'PROGRESS',
            id,
            progress: (i / entries.length) * 100,
            message: `Processing certificate ${i + 1} of ${entries.length}...`
          });
          
          const pdfBytes = await generatePdfInWorker({
            ...commonData,
            entryData: entry.data
          });
          
          results.push({
            id: entry.id,
            pdfBytes
          });
        }
        
        self.postMessage({
          type: 'BATCH_SUCCESS',
          id,
          results
        });
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      id,
      error: error.message
    });
  }
});