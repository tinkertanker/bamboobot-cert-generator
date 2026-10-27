/** @jest-environment node */
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'fs';
import os from 'os';
import path from 'path';

describe('SQLite to D1 recovery export', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(path.join(os.tmpdir(), 'd1-restore-test-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('preserves auth IDs, integer OAuth expiry and nulls, but converts native DateTime milliseconds to D1 UTC text', () => {
    const source = path.join(root, 'source.db');
    const output = path.join(root, 'restore.sql');
    execFileSync('python3', ['-c', `
import sqlite3,sys
c=sqlite3.connect(sys.argv[1])
c.executescript('''
CREATE TABLE User (id TEXT PRIMARY KEY, name TEXT, email TEXT, emailVerified DATETIME, image TEXT, createdAt DATETIME NOT NULL, lastActiveAt DATETIME, tier TEXT NOT NULL DEFAULT 'free', dailyPdfCount INTEGER NOT NULL DEFAULT 0, dailyEmailCount INTEGER NOT NULL DEFAULT 0, lastUsageReset DATETIME NOT NULL, lifetimePdfCount INTEGER NOT NULL DEFAULT 0, lifetimeEmailCount INTEGER NOT NULL DEFAULT 0);
CREATE TABLE Account (id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES User(id), type TEXT NOT NULL, provider TEXT NOT NULL, providerAccountId TEXT NOT NULL, expires_at INTEGER);
''')
c.execute('INSERT INTO User(id,name,email,createdAt,lastUsageReset) VALUES (?,?,?,?,?)', ('user-old', "O'Neil", 'fixture@example.test', 1750000000123, 1750000000456))
c.execute('INSERT INTO Account VALUES (?,?,?,?,?,?)', ('account-old','user-old','oauth','google','provider-old',1750003600))
c.commit()
`, source]);
    execFileSync('python3', ['scripts/export-d1-recovery.py', '--source', source, '--output', output]);
    const rows = JSON.parse(execFileSync('python3', ['-c', `
import sqlite3,sys,json
c=sqlite3.connect(':memory:');c.executescript(open(sys.argv[1]).read())
c.row_factory=sqlite3.Row
print(json.dumps({'user':dict(c.execute('SELECT * FROM User').fetchone()),'account':dict(c.execute('SELECT * FROM Account').fetchone()),'fk':c.execute('PRAGMA foreign_key_check').fetchall(),'migrations':[r[0] for r in c.execute('SELECT name FROM d1_migrations ORDER BY name')]}))
`, output], { encoding: 'utf8' }));
    expect(rows.user).toMatchObject({
      id: 'user-old', name: "O'Neil", emailVerified: null, tierSource: 'env',
      createdAt: '2025-06-15T15:06:40.123+00:00', lastUsageReset: '2025-06-15T15:06:40.456+00:00',
    });
    expect(rows.account).toMatchObject({ id: 'account-old', userId: 'user-old', providerAccountId: 'provider-old', expires_at: 1750003600 });
    expect(rows.fk).toEqual([]);
    expect(rows.migrations).toEqual(['0001_initial.sql', '0002_rate_limit.sql', '0003_pdf_jobs.sql', '0004_email_jobs.sql', '0005_maintenance.sql', '0006_agent_certificates.sql', '0007_email_payload_reservations.sql']);
    expect(statSync(output).mode & 0o777).toBe(0o600);
    const original = readFileSync(source);
    expect(() => execFileSync('python3', ['scripts/export-d1-recovery.py', '--source', source, '--output', output], { stdio: 'pipe' })).toThrow();
    expect(readFileSync(source)).toEqual(original);
  });
});
