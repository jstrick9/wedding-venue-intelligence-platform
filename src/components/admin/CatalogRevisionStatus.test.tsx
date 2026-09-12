import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CatalogRevisionStatus, HistoricalRevisionNotice } from './CatalogRevisionStatus';

const historical = {
  id: 'chair-r1', archived: true, catalogFamilyId: 'chair-family', catalogRevision: 1,
};
const current = {
  id: 'chair-r2', archived: false, catalogFamilyId: 'chair-family', catalogRevision: 2,
};

describe('CatalogRevisionStatus', () => {
  it('labels current and historical revisions and explains immutable migration', () => {
    const definitions = [historical, current];
    render(
      <>
        <CatalogRevisionStatus definition={historical} definitions={definitions} />
        <HistoricalRevisionNotice definition={historical} definitions={definitions} />
        <CatalogRevisionStatus definition={current} definitions={definitions} />
      </>,
    );
    expect(screen.getByText('Historical revision')).toBeInTheDocument();
    expect(screen.getByText('Current revision')).toBeInTheDocument();
    expect(screen.getByText('Revision 1')).toBeInTheDocument();
    expect(screen.getByText('Revision 2')).toBeInTheDocument();
    expect(screen.getByText(/cannot be restored while a current revision is active/i)).toBeInTheDocument();
    expect(screen.getByText(/guided replacement/i)).toBeInTheDocument();
  });

  it('does not add revision noise to an ordinary standalone definition', () => {
    const { container } = render(
      <CatalogRevisionStatus definition={{ id: 'plain' }} definitions={[{ id: 'plain' }]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
