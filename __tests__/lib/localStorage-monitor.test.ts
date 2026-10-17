import { analyzeLocalStorage, cleanupLocalStorage } from '@/lib/localStorage-monitor';

describe('localStorage monitor', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('classifies current and legacy saved projects as projects', async () => {
    localStorage.setItem(
      'bamboobot_project_v1_abc',
      JSON.stringify({ name: 'Current', lastModified: '2026-01-01T00:00:00.000Z', tableData: [{ a: '1' }], positions: { a: {} } })
    );
    localStorage.setItem('bamboobot_template_v1_old', JSON.stringify({ name: 'Legacy' }));
    localStorage.setItem('unrelated', 'x');

    const stats = await analyzeLocalStorage();

    expect(stats.byType.projects.count).toBe(2);
    expect(stats.byType.other.count).toBe(1);
    const current = stats.items.find(i => i.key === 'bamboobot_project_v1_abc');
    expect(current?.data).toMatchObject({ name: 'Current', dataRows: 1, textFields: 1 });
    expect(current?.lastModified).toBe('2026-01-01T00:00:00.000Z');
  });

  it('removes current-format projects when clearing projects', async () => {
    localStorage.setItem('bamboobot_project_v1_abc', JSON.stringify({ name: 'Current' }));
    localStorage.setItem('unrelated', 'x');

    const result = await cleanupLocalStorage({ target: 'projects' });

    expect(result.deletedCount).toBe(1);
    expect(localStorage.getItem('bamboobot_project_v1_abc')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('x');
  });
});
