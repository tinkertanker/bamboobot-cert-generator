import { analyzeLocalStorage, cleanupLocalStorage } from '@/lib/localStorage-monitor';
import { guardLocalStorageForUser } from '@/lib/storage/account-scope';
import { ProjectStorage } from '@/lib/project-storage';

describe('localStorage monitor', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('keeps owned projects readable after unrelated cleanup and same-account reload', async () => {
    guardLocalStorageForUser('alice');
    const saved = await ProjectStorage.saveProject('Alice', {}, ['Name'], '/image.png', 'image.png', [{ Name: 'Alice' }]);
    localStorage.setItem('unrelated', 'remove');
    await cleanupLocalStorage({ target: 'other' });
    guardLocalStorageForUser('alice');
    expect(ProjectStorage.loadProject(saved.id!)?.tableData).toEqual([{ Name: 'Alice' }]);
    expect(localStorage.getItem('unrelated')).toBeNull();
    guardLocalStorageForUser('bob');
    expect(ProjectStorage.loadProject(saved.id!)).toBeNull();
  });

  it('does not disclose or delete quarantined legacy data', async () => {
    const key = 'bamboobot_quarantine_fixture';
    localStorage.setItem(key, JSON.stringify({ recipient: 'private@example.test' }));
    expect((await analyzeLocalStorage()).items.find(item => item.key === key)?.data).toEqual({ quarantined: true });
    await cleanupLocalStorage({ target: 'all' });
    expect(localStorage.getItem(key)).toContain('private@example.test');
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
