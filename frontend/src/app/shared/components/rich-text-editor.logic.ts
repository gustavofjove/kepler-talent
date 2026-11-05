/** A formatting control the rich-text editor can offer (KTL-46 design D6). */
export type RichTextFormat = 'bold' | 'italic' | 'bulletList' | 'numberedList';

/** Position descriptions (KTL-15). */
export const POSITION_DESCRIPTION_FORMATS: readonly RichTextFormat[] = [
  'bold',
  'italic',
  'bulletList',
  'numberedList',
];

/** Experience functions (KTL-46): the position formats; underline was dropped. */
export const EXPERIENCE_FUNCTIONS_FORMATS: readonly RichTextFormat[] = [
  'bold',
  'italic',
  'bulletList',
  'numberedList',
];
