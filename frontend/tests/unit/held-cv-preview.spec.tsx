import { render, screen } from '@testing-library/react';
import { FIT_WIDTH_FRAGMENT } from '../../src/app/features/candidates/components/candidate-cv-preview.logic';
import { HeldCvPreview } from '../../src/app/features/candidates/components/held-cv-preview';

describe('HeldCvPreview (KTL-47)', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let next = 0;

  beforeEach(() => {
    next = 0;
    createObjectURL = vi.fn(() => `blob:held-${++next}`);
    revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
  });

  const pdf = (name = 'cv-ana.pdf') => new File(['%PDF-test'], name, { type: 'application/pdf' });

  it('shows a PDF in a viewer fitted to the width, with an accessible name', () => {
    const file = pdf();
    render(<HeldCvPreview file={file} />);

    expect(screen.getByRole('heading', { name: 'Vista previa del CV' })).toBeInTheDocument();
    const viewer = screen.getByTestId('held-cv-preview-viewer');
    expect(viewer).toHaveAttribute('data', `blob:held-1${FIT_WIDTH_FRAGMENT}`);
    expect(viewer).toHaveAttribute('type', 'application/pdf');
    expect(viewer).toHaveAccessibleName('Vista previa del CV en PDF');
    expect(createObjectURL).toHaveBeenCalledWith(file);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the file name and the PDF-only message for a DOCX, with no object URL', () => {
    render(<HeldCvPreview file={new File(['PK'], 'cv-ana.docx')} />);

    const message = screen.getByTestId('held-cv-preview-unsupported');
    expect(message).toHaveTextContent('cv-ana.docx');
    expect(message).toHaveTextContent('La vista previa solo está disponible para CV en PDF.');
    expect(screen.queryByTestId('held-cv-preview-viewer')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('releases the object URL when the file changes and when it unmounts', () => {
    const { rerender, unmount } = render(<HeldCvPreview file={pdf()} />);

    rerender(<HeldCvPreview file={pdf('segundo.pdf')} />);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:held-1');
    expect(screen.getByTestId('held-cv-preview-viewer')).toHaveAttribute(
      'data',
      `blob:held-2${FIT_WIDTH_FRAGMENT}`,
    );

    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:held-2');
    expect(createObjectURL).toHaveBeenCalledTimes(2);
  });
});
