import React from 'react';
import { render } from '@testing-library/react';
import Spinner from '../../components/Spinner';

describe('Spinner Component', () => {
  it('renders without crashing', () => {
    const { container } = render(<Spinner />);
    expect(container).toBeTruthy();
  });

  it('renders the spinner element', () => {
    const { container } = render(<Spinner />);
    const spinnerElement = container.querySelector('.spinner');
    expect(spinnerElement).toBeInTheDocument();
  });

  it('has the correct styling', () => {
    const { container } = render(<Spinner />);
    const spinnerOverlay = container.querySelector('.spinner-overlay');
    const spinnerElement = container.querySelector('.spinner');
    
    expect(spinnerOverlay).toHaveStyle(`
      position: absolute;
      display: flex;
      align-items: center;
      justify-content: center;
    `);
    
    expect(spinnerElement).toHaveStyle(`
      border-radius: 50%;
      width: 40px;
      height: 40px;
    `);
  });
});