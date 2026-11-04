/**
 * Stored project payloads, including legacy and malformed shapes, with the list
 * summaries the original JavaScript mapper produced for them (derived by hand
 * from Array.isArray, Object.keys and JS truthiness, not from the SQL).
 */
export const projectSummaryFixtures: Array<{ name: string; data: unknown; summary: {
  columnsCount: number; rowsCount: number; hasEmailConfig: boolean; imageStatus: 'available' | 'missing';
} }> = [
  { name: 'Current', data: { columns: ['a', 'b', 'c'], positions: 'zz', tableData: [{}, {}],
    emailConfig: { isConfigured: true }, certificateImage: { url: '/x.jpg' } },
  summary: { columnsCount: 3, rowsCount: 2, hasEmailConfig: true, imageStatus: 'available' } },
  { name: 'Legacy positions', data: { positions: { a: {}, b: {} }, tableData: 'nope',
    emailConfig: { isConfigured: 'yes' }, certificateImage: { isCloudStorage: 1 } },
  summary: { columnsCount: 2, rowsCount: 0, hasEmailConfig: true, imageStatus: 'available' } },
  { name: 'Array positions', data: { columns: 'abc', positions: ['p', 'q', 'r', 's'],
    emailConfig: { isConfigured: 0 }, certificateImage: { url: '' } },
  summary: { columnsCount: 4, rowsCount: 0, hasEmailConfig: false, imageStatus: 'missing' } },
  // Object.keys('é😀') has three UTF-16 code units; the string '0' is truthy.
  { name: 'String positions', data: { positions: 'é😀', emailConfig: { isConfigured: '' },
    certificateImage: { isCloudStorage: false, url: '0' } },
  summary: { columnsCount: 3, rowsCount: 0, hasEmailConfig: false, imageStatus: 'available' } },
  { name: 'Scalar positions', data: { positions: 7, emailConfig: { isConfigured: [] }, certificateImage: { isCloudStorage: {} } },
  summary: { columnsCount: 0, rowsCount: 0, hasEmailConfig: true, imageStatus: 'available' } },
  { name: 'Fractional flag', data: { tableData: [], emailConfig: { isConfigured: 0.5 }, certificateImage: { url: null } },
  summary: { columnsCount: 0, rowsCount: 0, hasEmailConfig: true, imageStatus: 'missing' } },
  { name: 'Wrong containers', data: { columns: {}, positions: {}, emailConfig: 'isConfigured', certificateImage: ['url'] },
  summary: { columnsCount: 0, rowsCount: 0, hasEmailConfig: false, imageStatus: 'missing' } },
  { name: 'False flags', data: { emailConfig: { isConfigured: false }, certificateImage: { isCloudStorage: null } },
  summary: { columnsCount: 0, rowsCount: 0, hasEmailConfig: false, imageStatus: 'missing' } },
  { name: 'Array root', data: ['columns', 'tableData'],
    summary: { columnsCount: 0, rowsCount: 0, hasEmailConfig: false, imageStatus: 'missing' } },
  { name: 'String root', data: 'positions',
    summary: { columnsCount: 0, rowsCount: 0, hasEmailConfig: false, imageStatus: 'missing' } },
];

/** Fixtures are stored oldest first, so the list must return them reversed. */
export const fixtureTimestamp = (index: number) => new Date(Date.UTC(2025, 0, 1, 0, 0, index, 123));
