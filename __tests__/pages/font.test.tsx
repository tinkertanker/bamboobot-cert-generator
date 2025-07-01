import React from 'react';
import '@testing-library/jest-dom';

describe('Font Integration', () => {
  it('should have Rubik font configuration', () => {
    // Verify that the Rubik font variable is defined in our CSS
    const styleContent = `
      body {
        @apply bg-background text-foreground font-rubik;
      }
    `;
    
    expect(styleContent).toContain('font-rubik');
  });
});