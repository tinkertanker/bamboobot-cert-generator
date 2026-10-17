import React from 'react';
import { render, screen } from '@testing-library/react';
import Spinner from '../../components/Spinner';

describe('Spinner Component', () => {
  it('announces loading to assistive technology', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading…');
  });
});
