#!/usr/bin/env python3
"""Export a recovered Prisma SQLite snapshot for an EMPTY D1 target.

Reads the source read-only. Output contains personal data and OAuth tokens:
keep it private; never commit it or paste it into a terminal/chat.
No network calls or database writes outside an in-memory validation DB.
"""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import sqlite3


ROOT = Path(__file__).resolve().parent.parent


def identifier(value):
    return '"' + value.replace('"', '""') + '"'


def timestamp(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        # Native Prisma SQLite uses milliseconds; OAuth expires_at uses seconds
        # but is an Int, not DateTime, and must never enter this function.
        date = datetime.datetime.fromtimestamp(value / 1000, datetime.timezone.utc)
    else:
        date = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
        if date.tzinfo is None:
            date = date.replace(tzinfo=datetime.timezone.utc)
    return date.astimezone(datetime.timezone.utc).isoformat(timespec='milliseconds')


def export(source, output):
    output = Path(output)
    if output.parent.stat().st_mode & 0o077:
        raise ValueError('Output parent must be private (0700)')
    source_db = sqlite3.connect(Path(source).resolve().as_uri() + '?mode=ro', uri=True)
    source_db.execute('PRAGMA query_only=ON')
    if source_db.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
        raise ValueError('Source database failed integrity check')
    if source_db.execute('PRAGMA foreign_key_check').fetchall():
        raise ValueError('Source database has foreign key violations')

    migrations = sorted((ROOT / 'prisma/d1-migrations').glob('*.sql'))
    schema = '\n'.join(migration.read_text() for migration in migrations)
    # Record the schema included in this empty-target restore so Wrangler does
    # not try to CREATE the same tables again on its next migrations apply.
    schema += '''
CREATE TABLE IF NOT EXISTS "d1_migrations" (
    "id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "name" TEXT UNIQUE,
    "applied_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
'''
    for migration in migrations:
        name = migration.name.replace("'", "''")
        schema += f"INSERT INTO d1_migrations (name) VALUES ('{name}');\n"
    models = {}
    for name, body in re.findall(r'^model (\w+) \{(.*?)^\}', (ROOT / 'prisma/schema.prisma').read_text(), re.M | re.S):
        models[name] = set(re.findall(r'^\s*(\w+)\s+DateTime\??\s', body, re.M))
    source_tables = {row[0] for row in source_db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    unexpected = source_tables - set(models) - {'_prisma_migrations', 'sqlite_sequence'}
    if unexpected:
        raise ValueError('Unrecognised source tables; refusing to silently drop data')

    check = sqlite3.connect(':memory:')
    check.execute('PRAGMA foreign_keys=ON')
    check.executescript(schema)
    statements = []
    counts = {}
    for table, date_fields in models.items():
        counts[table] = 0
        if table not in source_tables:
            continue
        columns = [row[1] for row in source_db.execute(f'PRAGMA table_info({identifier(table)})')]
        target_columns = {row[1] for row in check.execute(f'PRAGMA table_info({identifier(table)})')}
        if set(columns) - target_columns:
            raise ValueError('Unrecognised source columns; refusing to silently drop data')
        fields = ','.join(identifier(column) for column in columns)
        for row in source_db.execute(f'SELECT {fields} FROM {identifier(table)}'):
            values = [timestamp(value) if column in date_fields else value for column, value in zip(columns, row)]
            literals = ','.join(check.execute('SELECT quote(?)', (value,)).fetchone()[0] for value in values)
            statement = f'INSERT INTO {identifier(table)} ({fields}) VALUES ({literals});'
            check.execute(statement)
            statements.append(statement)
            counts[table] += 1
    if check.execute('PRAGMA foreign_key_check').fetchall():
        raise ValueError('Converted database has foreign key violations')
    if check.execute('PRAGMA integrity_check').fetchall() != [('ok',)]:
        raise ValueError('Converted database failed integrity check')
    # CREATE (not IF NOT EXISTS), no DELETE, no upsert: importing into a populated
    # target fails rather than overwriting existing identities or app data.
    with os.fdopen(os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as stream:
        stream.write('-- PRIVATE: recovered application/auth data. Empty target only.\n')
        stream.write(schema)
        stream.write('\n' + '\n'.join(statements) + '\n')
    source_db.close()
    check.close()
    return {'verified': True, 'counts': counts, 'dates': 'UTC ISO-8601 milliseconds'}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    try:
        print(json.dumps(export(args.source, args.output)))
    except Exception:
        # Exceptions can include SQL, personal data or OAuth tokens.
        raise SystemExit('Recovery export failed; check private source integrity, schema and output permissions. No data logged.')
