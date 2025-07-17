import React, { useState } from 'react';
import { usePdfWorker } from '@/hooks/usePdfWorker';
import { useCsvWorker } from '@/hooks/useCsvWorker';
import { COLORS } from '@/utils/styles';

export function WebWorkerExample() {
  const { generatePdf, generateBatch, progress: pdfProgress, isProcessing: isPdfProcessing } = usePdfWorker();
  const { parseFile, progress: csvProgress, isProcessing: isCsvProcessing } = useCsvWorker();
  const [results, setResults] = useState<string[]>([]);

  // Example: Parse CSV file using web worker
  const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const startTime = performance.now();
      const result = await parseFile(file);
      const endTime = performance.now();

      setResults(prev => [...prev, 
        `CSV parsed: ${result.rowCount} rows, ${result.columnCount} columns in ${Math.round(endTime - startTime)}ms`
      ]);
    } catch (error) {
      console.error('CSV parsing error:', error);
      setResults(prev => [...prev, `CSV parsing failed: ${error.message}`]);
    }
  };

  // Example: Generate PDF using web worker
  const handlePdfGeneration = async () => {
    try {
      const startTime = performance.now();
      
      // Mock data for example
      const templateResponse = await fetch('/api/mock-template');
      const templateBytes = await templateResponse.arrayBuffer();
      
      const pdfBytes = await generatePdf({
        templateBytes,
        entryData: {
          name: { text: 'John Doe', color: [0, 0, 0] },
          title: { text: 'Web Worker Excellence', color: [0, 0, 1] }
        },
        positions: {
          name: { x: 0.5, y: 0.5, fontSize: 24, alignment: 'center' },
          title: { x: 0.5, y: 0.6, fontSize: 18, alignment: 'center' }
        },
        uiContainerDimensions: { width: 800, height: 600 }
      });
      
      const endTime = performance.now();
      
      // Create download link
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'worker-generated.pdf';
      a.click();
      URL.revokeObjectURL(url);
      
      setResults(prev => [...prev, 
        `PDF generated: ${pdfBytes.length} bytes in ${Math.round(endTime - startTime)}ms`
      ]);
    } catch (error) {
      console.error('PDF generation error:', error);
      setResults(prev => [...prev, `PDF generation failed: ${error.message}`]);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Web Worker Performance Demo</h2>
      
      <div className="grid md:grid-cols-2 gap-6">
        {/* CSV Parser Demo */}
        <div className="border rounded-lg p-4" style={{ borderColor: COLORS.border }}>
          <h3 className="text-lg font-semibold mb-4">CSV Parser Worker</h3>
          
          <input
            type="file"
            accept=".csv,.tsv"
            onChange={handleCsvUpload}
            disabled={isCsvProcessing}
            className="mb-4"
          />
          
          {isCsvProcessing && (
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Processing...</span>
                <span>{Math.round(csvProgress.percent)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="h-2 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${csvProgress.percent}%`,
                    backgroundColor: COLORS.primary 
                  }}
                />
              </div>
              <p className="text-sm text-gray-600 mt-1">{csvProgress.message}</p>
            </div>
          )}
        </div>

        {/* PDF Generator Demo */}
        <div className="border rounded-lg p-4" style={{ borderColor: COLORS.border }}>
          <h3 className="text-lg font-semibold mb-4">PDF Generator Worker</h3>
          
          <button
            onClick={handlePdfGeneration}
            disabled={isPdfProcessing}
            className="px-4 py-2 rounded text-white disabled:opacity-50"
            style={{ backgroundColor: COLORS.primary }}
          >
            Generate Sample PDF
          </button>
          
          {isPdfProcessing && (
            <div className="mt-4">
              <div className="flex justify-between text-sm mb-1">
                <span>Generating PDF...</span>
                <span>{Math.round(pdfProgress.percent)}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="h-2 rounded-full transition-all duration-300"
                  style={{ 
                    width: `${pdfProgress.percent}%`,
                    backgroundColor: COLORS.primary 
                  }}
                />
              </div>
              <p className="text-sm text-gray-600 mt-1">{pdfProgress.message}</p>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="mt-6 border rounded-lg p-4" style={{ borderColor: COLORS.border }}>
          <h3 className="text-lg font-semibold mb-2">Results</h3>
          <ul className="space-y-1">
            {results.map((result, index) => (
              <li key={index} className="text-sm font-mono">
                {result}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Benefits */}
      <div className="mt-6 bg-gray-50 rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-2">Web Worker Benefits</h3>
        <ul className="space-y-2 text-sm">
          <li>✓ Non-blocking UI - Heavy operations run in background</li>
          <li>✓ Better performance - Utilize multiple CPU cores</li>
          <li>✓ Progress updates - Real-time feedback without freezing</li>
          <li>✓ Memory isolation - Crashes won't affect main thread</li>
          <li>✓ Scalability - Handle larger datasets efficiently</li>
        </ul>
      </div>
    </div>
  );
}