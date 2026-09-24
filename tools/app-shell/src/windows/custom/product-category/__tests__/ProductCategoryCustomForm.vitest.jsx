import { render, screen } from '@testing-library/react';

vi.mock('@/i18n', () => ({
  useUI: () => (key) => key,
  useLabel: () => (key) => key,
}));

const receivedProps = [];
vi.mock('@/components/contract-ui', () => ({
  EntityForm: (props) => {
    receivedProps.push(props);
    return <div data-testid={`entity-form-${receivedProps.length}`} />;
  },
}));

import ProductCategoryCustomForm from '../ProductCategoryCustomForm.jsx';

const baseProps = {
  entity: 'header',
  data: { name: 'Test', searchKey: 'TST' },
  token: 'tok',
  apiBaseUrl: '/sws/neo/product-category',
  catalogs: {},
  api: {},
  onChange: vi.fn(),
  onFieldBlur: vi.fn(),
};

beforeEach(() => {
  receivedProps.length = 0;
});

describe('ProductCategoryCustomForm — respects readOnly (ETP-5205)', () => {
  it('forwards readOnly=true to every EntityForm call when the window is read-only', () => {
    render(<ProductCategoryCustomForm {...baseProps} readOnly />);
    expect(receivedProps).toHaveLength(4);
    receivedProps.forEach((p) => expect(p.readOnly).toBe(true));
  });

  it('regression: readOnly is falsy on every EntityForm call when not read-only', () => {
    render(<ProductCategoryCustomForm {...baseProps} />);
    expect(receivedProps).toHaveLength(4);
    receivedProps.forEach((p) => expect(p.readOnly).toBeFalsy());
  });
});
