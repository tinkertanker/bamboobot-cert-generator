import { updatePositionIfChanged } from '@/hooks/useDragAndDrop';
import type { Positions } from '@/types/certificate';

describe('updatePositionIfChanged', () => {
  it('preserves the positions reference when drag coordinates are unchanged', () => {
    const positions: Positions = {
      name: { x: 50, y: 50, fontSize: 20 }
    };

    expect(updatePositionIfChanged(positions, 'name', 50, 50)).toBe(positions);
  });

  it('updates only the moved field while preserving its formatting', () => {
    const positions: Positions = {
      name: { x: 50, y: 50, fontSize: 20 },
      title: { x: 40, y: 30, bold: true }
    };

    const updated = updatePositionIfChanged(positions, 'name', 52, 48);

    expect(updated).not.toBe(positions);
    expect(updated.name).toEqual({ x: 52, y: 48, fontSize: 20 });
    expect(updated.title).toBe(positions.title);
  });
});
