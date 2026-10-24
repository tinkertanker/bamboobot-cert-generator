import type { Positions } from '@/types/certificate';
import { FONT_CAPABILITIES } from '@/utils/constants';

export class AgentError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export interface AgentInput {
  label: string;
  rows: Array<{ id: string; fields: Record<string, string> }>;
  positions: Positions;
}

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function validateAgentInput(value: unknown): AgentInput {
  if (!object(value) || typeof value.label !== 'string' || !value.label.trim() || value.label.length > 100 || /[\u0000-\u001f\u007f\p{Cf}]/u.test(value.label)) {
    throw new AgentError('A label of 1–100 characters is required');
  }
  if (!Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > 500) {
    throw new AgentError('Supply 1–500 recipient rows');
  }
  if (!object(value.positions) || Object.keys(value.positions).length < 1 || Object.keys(value.positions).length > 20) {
    throw new AgentError('Map 1–20 visible text fields');
  }
  const positions = value.positions;
  for (const [key, pos] of Object.entries(positions)) {
    if (!/^[\w -]{1,80}$/.test(key) || ['__proto__', 'constructor', 'prototype'].includes(key) || !object(pos)) throw new AgentError('Invalid field mapping');
    const allowed = ['x', 'y', 'width', 'fontSize', 'fontFamily', 'alignment', 'textMode', 'lineHeight', 'color', 'bold', 'italic'];
    if (Object.keys(pos).some(k => !allowed.includes(k))) throw new AgentError('Unsupported layout property');
    for (const [name, low, high] of [['x', 0, 100], ['y', 0, 100], ['width', 1, 100], ['fontSize', 8, 120], ['lineHeight', 1, 2]] as const) {
      const n = pos[name];
      if ((n === undefined && (name === 'x' || name === 'y')) || (n !== undefined && (typeof n !== 'number' || !Number.isFinite(n) || n < low || n > high))) {
        throw new AgentError(`Invalid ${name} for field ${key}`);
      }
    }
    const family = pos.fontFamily ?? 'Helvetica';
    if (typeof family !== 'string' || !Object.hasOwn(FONT_CAPABILITIES, family)) throw new AgentError('Unsupported font');
    const capabilities = FONT_CAPABILITIES[family as keyof typeof FONT_CAPABILITIES];
    for (const style of ['bold', 'italic'] as const) {
      if (pos[style] !== undefined && typeof pos[style] !== 'boolean') throw new AgentError('Invalid font style');
      if (pos[style] && !capabilities[style]) throw new AgentError('Font style is unavailable');
    }
    if (pos.color !== undefined && (typeof pos.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(pos.color))) throw new AgentError('Use a six-digit hex colour');
    if (pos.alignment !== undefined && (typeof pos.alignment !== 'string' || !['left', 'center', 'right'].includes(pos.alignment))) throw new AgentError('Invalid alignment');
    if (pos.textMode !== undefined && (typeof pos.textMode !== 'string' || !['shrink', 'multiline'].includes(pos.textMode))) throw new AgentError('Invalid text mode');
    const x = pos.x as number;
    const width = (pos.width ?? 90) as number;
    const left = pos.alignment === 'center' ? x - width / 2 : pos.alignment === 'right' ? x - width : x;
    if (left < 0 || left + width > 100) throw new AgentError(`Text box ${key} extends outside the page`);
  }
  const ids = new Set<string>();
  for (const row of value.rows) {
    if (!object(row) || typeof row.id !== 'string' || !/^[\w-]{1,80}$/.test(row.id) || ids.has(row.id) || !object(row.fields)) throw new AgentError('Each recipient needs unique id and string fields');
    ids.add(row.id);
    if (Object.keys(row.fields).length > 50) throw new AgentError('Too many recipient columns');
    for (const text of Object.values(row.fields)) {
      if (typeof text !== 'string' || text.length > 2000 || /[\u0000-\u001f\u007f]/.test(text)) throw new AgentError('Recipient values must be single-line strings, at most 2,000 characters');
    }
    for (const key of Object.keys(positions)) {
      if (typeof row.fields[key] !== 'string' || !(row.fields[key] as string).trim()) throw new AgentError(`Every recipient needs a value for ${key}`);
      if (/\p{Cf}/u.test(row.fields[key] as string)) throw new AgentError(`Printed field ${key} must not contain Unicode format characters; supply explicit visible text`);
    }
  }
  // Drop transport-only options and copy into an immutable JSON-shaped value.
  return JSON.parse(JSON.stringify({ label: value.label, rows: value.rows, positions })) as AgentInput;
}
