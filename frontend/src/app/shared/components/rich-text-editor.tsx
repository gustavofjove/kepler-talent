import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import {
  ListItemNode,
  ListNode,
  INSERT_ORDERED_LIST_COMMAND,
  INSERT_UNORDERED_LIST_COMMAND,
} from '@lexical/list';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getRoot,
  $insertNodes,
  $setSelection,
  COMMAND_PRIORITY_HIGH,
  FORMAT_TEXT_COMMAND,
  type EditorState,
  type LexicalEditor,
  type TextFormatType,
} from 'lexical';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { RichTextFormat } from './rich-text-editor.logic';
import { BoldIcon, BulletListIcon, ItalicIcon, NumberedListIcon } from './rich-text-icons';
import './rich-text-editor.css';

interface Control {
  /** Appended to the editor's `name` for the button's own `name=`, e.g. `descriptionBold`. */
  suffix: string;
  labelKey: string;
  icon: () => ReactNode;
  run: (editor: LexicalEditor) => void;
}

const CONTROLS: Record<RichTextFormat, Control> = {
  bold: {
    suffix: 'Bold',
    labelKey: 'richText.bold',
    icon: BoldIcon,
    run: (editor) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold'),
  },
  italic: {
    suffix: 'Italic',
    labelKey: 'richText.italic',
    icon: ItalicIcon,
    run: (editor) => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic'),
  },
  bulletList: {
    suffix: 'Bullets',
    labelKey: 'richText.bullets',
    icon: BulletListIcon,
    run: (editor) => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined),
  },
  numberedList: {
    suffix: 'Numbers',
    labelKey: 'richText.numbers',
    icon: NumberedListIcon,
    run: (editor) => editor.dispatchCommand(INSERT_ORDERED_LIST_COMMAND, undefined),
  },
};

/** Text formats the API does not keep: their keyboard shortcuts (Ctrl+U, …) do nothing. */
const UNSUPPORTED_TEXT_FORMATS: ReadonlySet<TextFormatType> = new Set([
  'underline',
  'strikethrough',
  'code',
  'subscript',
  'superscript',
  'highlight',
]);

function UnsupportedFormatsPlugin() {
  const [editor] = useLexicalComposerContext();
  useEffect(
    () =>
      editor.registerCommand(
        FORMAT_TEXT_COMMAND,
        (format) => UNSUPPORTED_TEXT_FORMATS.has(format),
        COMMAND_PRIORITY_HIGH,
      ),
    [editor],
  );
  return null;
}

function Toolbar({ name, formats }: { name: string; formats: readonly RichTextFormat[] }) {
  const [editor] = useLexicalComposerContext();
  const { t } = useTranslation();
  return (
    <div className="rich-text-toolbar" role="toolbar" aria-label={t('richText.toolbar')}>
      {formats.map((format) => {
        const control = CONTROLS[format];
        const Icon = control.icon;
        return (
          <button
            key={format}
            type="button"
            name={`${name}${control.suffix}`}
            onClick={() => control.run(editor)}
          >
            <Icon />
            <span>{t(control.labelKey)}</span>
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  value: string;
  /** Receives the editor's HTML, or `''` once no text is left. The API sanitises it. */
  onChange: (html: string) => void;
  formats: readonly RichTextFormat[];
  /** The contenteditable's `name=`, and the prefix of the toolbar buttons' names. */
  name: string;
  ariaLabel: string;
  placeholder: string;
  testId: string;
  namespace: string;
  /** Lets the body be resized vertically, like a textarea (KTL-46). */
  resizable?: boolean;
  /** Associates the editor with a visible label or a description, as for a form control. */
  ariaDescribedBy?: string;
}

/**
 * Rich text on Lexical, shared by position descriptions (KTL-15) and experience functions
 * (KTL-46). The initial value is read once: give the editor a new `key` to load another one.
 */
export function RichTextEditor({
  value,
  onChange,
  formats,
  name,
  ariaLabel,
  placeholder,
  testId,
  namespace,
  resizable = false,
  ariaDescribedBy,
}: Props) {
  return (
    <LexicalComposer
      initialConfig={{
        namespace,
        nodes: [ListNode, ListItemNode],
        onError: (error) => {
          throw error;
        },
        editorState: (editor) => {
          if (!value) return;
          const document = new DOMParser().parseFromString(value, 'text/html');
          $getRoot().clear();
          $insertNodes($generateNodesFromDOM(editor, document));
          // Loading a value is not editing it: leave no caret behind, so the page does not
          // scroll to the editor when «Editar» loads an entry.
          $setSelection(null);
        },
      }}
    >
      <div className="rich-text-editor" data-testid={testId}>
        <Toolbar name={name} formats={formats} />
        {/* The placeholder is positioned against this body, not the editor, so a toolbar that
            wraps onto several rows at narrow widths never covers it. */}
        <div className={resizable ? 'rich-text-body is-resizable' : 'rich-text-body'}>
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                name={name}
                aria-label={ariaLabel}
                aria-describedby={ariaDescribedBy}
                className="rich-text-input"
              />
            }
            placeholder={<span className="rich-text-placeholder">{placeholder}</span>}
            ErrorBoundary={({ children }) => children}
          />
        </div>
        <HistoryPlugin />
        <ListPlugin />
        <UnsupportedFormatsPlugin />
        <OnChangePlugin
          onChange={(state: EditorState, editor) =>
            state.read(() =>
              onChange($getRoot().getTextContent().trim() ? $generateHtmlFromNodes(editor) : ''),
            )
          }
        />
      </div>
    </LexicalComposer>
  );
}

/** Shows rich text the API returned, which it has already sanitised. */
export function RichTextView({ html, testId, id }: { html: string; testId: string; id?: string }) {
  return (
    <div
      id={id}
      className="rich-text-view"
      data-testid={testId}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
