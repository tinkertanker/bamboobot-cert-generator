// Quick test script for localStorage monitoring (run in browser console)

// Mock localStorage for Node.js testing
const localStorage = {
  data: {},
  setItem(key, value) { this.data[key] = value; },
  getItem(key) { return this.data[key]; },
  removeItem(key) { delete this.data[key]; },
  get length() { return Object.keys(this.data).length; },
  key(index) { return Object.keys(this.data)[index]; }
};
global.localStorage = localStorage;

// Mock Blob for Node.js
global.Blob = class Blob {
  constructor(array) {
    this.size = array.join('').length * 2; // Rough UTF-16 estimate
  }
};

// Add some test data
localStorage.setItem('bamboobot_template_v1_test1', JSON.stringify({
  name: 'Test Project',
  created: new Date().toISOString(),
  lastModified: new Date().toISOString(),
  positions: { name: { x: 100, y: 200 } },
  tableData: [{ name: 'John', email: 'john@test.com' }],
  columns: ['name', 'email']
}));

localStorage.setItem('bamboobot_current_session_v1', JSON.stringify({
  tableData: [{ name: 'Test User' }],
  tableInput: 'name\nTest User',
  isFirstRowHeader: true,
  useCSVMode: false,
  lastModified: new Date().toISOString()
}));

localStorage.setItem('email-queue-test123', JSON.stringify({
  emails: [
    { status: 'sent', email: 'test1@example.com' },
    { status: 'error', email: 'test2@example.com' },
    { status: 'pending', email: 'test3@example.com' }
  ],
  updatedAt: new Date().toISOString()
}));

// Import and test the localStorage monitor
const { analyzeLocalStorage, cleanupLocalStorage, formatBytes } = require('./lib/localStorage-monitor.ts');

console.log('Testing localStorage monitoring...');

try {
  const stats = analyzeLocalStorage();
  console.log('✅ Analysis successful!');
  console.log(`Total size: ${formatBytes(stats.totalSize)}`);
  console.log(`Total items: ${stats.totalItems}`);
  console.log(`Quota usage: ${stats.quotaUsage.toFixed(1)}%`);
  console.log('By type:', Object.entries(stats.byType).map(([type, data]) => 
    `${type}: ${data.count} items (${formatBytes(data.size)})`
  ).join(', '));
  
  console.log('\n📋 Items:');
  stats.items.forEach(item => {
    console.log(`- ${item.key}: ${formatBytes(item.size)} (${item.type})`);
    if (item.data?.name) console.log(`  └ ${item.data.name}`);
  });
  
  // Test cleanup
  console.log('\n🧹 Testing cleanup...');
  const cleanupResult = cleanupLocalStorage({ target: 'email-queues' });
  console.log(`Cleaned up: ${cleanupResult.deletedCount} items, freed ${formatBytes(cleanupResult.freedSize)}`);
  
} catch (error) {
  console.error('❌ Test failed:', error);
}

console.log('\nTest completed!');