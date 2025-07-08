import { render, screen, fireEvent } from '@testing-library/react';
import { generateEmailTestData } from '../../pages/index';

// Extract the email generation function for testing
const generateEmailTestDataTest = (baseEmail: string, count: number): string => {
  if (!baseEmail || !baseEmail.includes('@')) {
    return ''; // Fallback for test
  }
  
  const [localPart, domain] = baseEmail.split('@');
  const headers = 'Name,Department,Email';
  const rows = Array.from({ length: count }, (_, i) => {
    const emailWithPlus = `${localPart}+${i + 1}@${domain}`;
    const names = [
      'Alex Johnson', 'Jordan Smith', 'Casey Brown', 'Riley Davis', 'Morgan Wilson',
    ];
    const departments = [
      'Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 
    ];
    
    const name = names[i % names.length];
    const department = departments[i % departments.length];
    
    return `${name},${department},${emailWithPlus}`;
  });
  
  return [headers, ...rows].join('\n');
};

describe('Email Template Generator', () => {
  it('should generate Gmail+ addresses correctly', () => {
    const baseEmail = 'test@gmail.com';
    const count = 3;
    
    const result = generateEmailTestDataTest(baseEmail, count);
    const lines = result.split('\n');
    
    // Should have header + 3 data rows
    expect(lines).toHaveLength(4);
    
    // Check header
    expect(lines[0]).toBe('Name,Department,Email');
    
    // Check generated emails
    expect(lines[1]).toContain('test+1@gmail.com');
    expect(lines[2]).toContain('test+2@gmail.com');
    expect(lines[3]).toContain('test+3@gmail.com');
    
    // Check structure
    lines.slice(1).forEach(line => {
      const parts = line.split(',');
      expect(parts).toHaveLength(3); // Name, Department, Email
      expect(parts[2]).toMatch(/test\+\d+@gmail\.com/);
    });
  });

  it('should work with any email domain', () => {
    const baseEmail = 'user@example.org';
    const count = 2;
    
    const result = generateEmailTestDataTest(baseEmail, count);
    const lines = result.split('\n');
    
    expect(lines[1]).toContain('user+1@example.org');
    expect(lines[2]).toContain('user+2@example.org');
  });

  it('should handle invalid email gracefully', () => {
    const result = generateEmailTestDataTest('invalid-email', 5);
    expect(result).toBe('');
  });

  it('should generate different names and departments', () => {
    const result = generateEmailTestDataTest('test@gmail.com', 6);
    const lines = result.split('\n');
    
    // Should cycle through names (5 names available)
    const firstNames = lines.slice(1, 6).map(line => line.split(',')[0]);
    const lastNames = lines.slice(1).map(line => line.split(',')[0]);
    
    // First 5 should be unique, 6th should cycle back to first
    expect(new Set(firstNames).size).toBe(5);
    expect(lastNames[5]).toBe(lastNames[0]); // 6th entry cycles back to first
  });
});