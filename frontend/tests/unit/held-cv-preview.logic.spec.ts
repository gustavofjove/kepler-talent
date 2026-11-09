import { isPdfFile } from '../../src/app/features/candidates/components/held-cv-preview.logic';

describe('isPdfFile (KTL-47)', () => {
  it.each([
    ['cv.pdf', true],
    ['CV-ANA.PDF', true],
    ['cv.docx', false],
    ['cv.pdf.docx', false],
    ['cv', false],
  ])('treats %s as a PDF: %s', (name, expected) => {
    expect(isPdfFile({ name })).toBe(expected);
  });
});
