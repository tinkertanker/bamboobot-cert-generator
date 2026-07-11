import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ConfirmationModals } from '@/components/modals/ConfirmationModals';
import type { Positions } from '@/types/certificate';

const positions: Positions = {
  Name: {
    x: 50,
    y: 50,
    color: '#123456',
    isColorAutomatic: false
  },
  Course: {
    x: 50,
    y: 60,
    color: '#123456',
    isColorAutomatic: false
  }
};

describe('ConfirmationModals automatic colour reset', () => {
  it('uses the analysed background colour when resetting one field', () => {
    const setPositions = jest.fn();

    render(
      <ConfirmationModals
        showResetFieldModal
        setShowResetFieldModal={jest.fn()}
        showClearAllModal={false}
        setShowClearAllModal={jest.fn()}
        selectedField="Name"
        positions={positions}
        setPositions={setPositions}
        tableData={[{ Name: 'Ada', Course: 'Math' }]}
        automaticTextColor="#ffffff"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));

    const update = setPositions.mock.calls[0][0];
    const result = update(positions) as Positions;
    expect(result.Name.color).toBe('#ffffff');
    expect(result.Name.isColorAutomatic).toBe(true);
  });

  it('uses the analysed background colour when clearing all formatting', () => {
    const setPositions = jest.fn();

    render(
      <ConfirmationModals
        showResetFieldModal={false}
        setShowResetFieldModal={jest.fn()}
        showClearAllModal
        setShowClearAllModal={jest.fn()}
        selectedField="Name"
        positions={positions}
        setPositions={setPositions}
        tableData={[{ Name: 'Ada', Course: 'Math' }]}
        automaticTextColor="#ffffff"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Clear All' }));

    const result = setPositions.mock.calls[0][0] as Positions;
    expect(result.Name.color).toBe('#ffffff');
    expect(result.Course.color).toBe('#ffffff');
    expect(result.Name.isColorAutomatic).toBe(true);
    expect(result.Course.isColorAutomatic).toBe(true);
  });
});
