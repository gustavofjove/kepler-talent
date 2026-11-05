import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $setSelection,
  FORMAT_TEXT_COMMAND,
  type LexicalEditor,
} from 'lexical';
import { RichTextEditor, RichTextView } from '../../src/app/shared/components/rich-text-editor';
import {
  EXPERIENCE_FUNCTIONS_FORMATS,
  POSITION_DESCRIPTION_FORMATS,
  type RichTextFormat,
} from '../../src/app/shared/components/rich-text-editor.logic';

function renderEditor(
  formats: readonly RichTextFormat[],
  onChange = vi.fn(),
  value = '',
  resizable = false,
) {
  render(
    <RichTextEditor
      value={value}
      onChange={onChange}
      formats={formats}
      name="functions"
      ariaLabel="Descripción"
      placeholder="Describe el puesto"
      testId="editor"
      namespace="Test"
      resizable={resizable}
    />,
  );
  return onChange;
}

const input = () => screen.getByRole('textbox', { name: 'Descripción' });
const lexical = () => (input() as HTMLElement & { __lexicalEditor: LexicalEditor }).__lexicalEditor;

// jsdom does not emit the beforeinput events Lexical types through (see the position editor spec).
function typeText(text: string) {
  act(() =>
    lexical().update(
      () => {
        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode(text));
        $getRoot().clear().append(paragraph);
        paragraph.select(0, text.length);
      },
      { discrete: true },
    ),
  );
}

describe('RichTextEditor', () => {
  beforeAll(() => {
    if (typeof globalThis.DragEvent === 'undefined') {
      (globalThis as { DragEvent?: unknown }).DragEvent = class DragEvent extends Event {};
    }
  });

  it.each([
    ['experience', EXPERIENCE_FUNCTIONS_FORMATS],
    ['position', POSITION_DESCRIPTION_FORMATS],
  ])('offers bold, italic and both lists for a %s, named after the editor', (_kind, formats) => {
    renderEditor(formats);

    const toolbar = screen.getByRole('toolbar', { name: 'Formato de la descripción' });
    expect(
      within(toolbar)
        .getAllByRole('button')
        .map((button) => [button.textContent, button.getAttribute('name')]),
    ).toEqual([
      ['Negrita', 'functionsBold'],
      ['Cursiva', 'functionsItalic'],
      ['Lista con viñetas', 'functionsBullets'],
      ['Lista numerada', 'functionsNumbers'],
    ]);
    expect(input()).toHaveAttribute('name', 'functions');
  });

  it('applies bold from the toolbar', async () => {
    const onChange = renderEditor(EXPERIENCE_FUNCTIONS_FORMATS);
    typeText('remoto');

    await userEvent.click(screen.getByRole('button', { name: 'Negrita' }));

    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith(expect.stringMatching(/<(b|strong)[^>]*>.*remoto/)),
    );
  });

  it('ignores the underline shortcut, which the API would not keep', async () => {
    const onChange = renderEditor(EXPERIENCE_FUNCTIONS_FORMATS);
    typeText('remoto');
    onChange.mockClear();

    act(() => {
      lexical().dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(input().querySelector('u')).toBeNull();
  });

  it('reports an empty value once no text is left, not an empty paragraph', async () => {
    const onChange = renderEditor(EXPERIENCE_FUNCTIONS_FORMATS, vi.fn(), '<p>Algo</p>');
    await waitFor(() => expect(input()).toHaveTextContent('Algo'));

    act(() =>
      lexical().update(
        () => {
          $getRoot().clear().append($createParagraphNode());
          // No selection to scroll into view: jsdom cannot measure it.
          $setSelection(null);
        },
        { discrete: true },
      ),
    );

    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(''));
  });

  it('does not report the initial value as a change', async () => {
    const onChange = renderEditor(
      EXPERIENCE_FUNCTIONS_FORMATS,
      vi.fn(),
      '<p><strong>Inicial</strong></p>',
    );

    await waitFor(() => expect(input()).toHaveTextContent('Inicial'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('lets a resizable body grow vertically only', () => {
    renderEditor(EXPERIENCE_FUNCTIONS_FORMATS, vi.fn(), '', true);

    expect(input().parentElement).toHaveClass('rich-text-body', 'is-resizable');
  });
});

describe('RichTextView', () => {
  it('renders the formatting the API returned', () => {
    render(<RichTextView html="<p><em>Uno</em></p><ul><li>Dos</li></ul>" testId="view" />);

    const view = screen.getByTestId('view');
    expect(within(view).getByText('Uno').tagName).toBe('EM');
    expect(within(view).getByRole('listitem')).toHaveTextContent('Dos');
  });
});
