import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RichTextEditor } from '../../../shared/components/rich-text-editor';
import { POSITION_DESCRIPTION_FORMATS } from '../../../shared/components/rich-text-editor.logic';

const COLLAPSED_DESCRIPTION_HEIGHT = 350;

export function PositionDescriptionEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <RichTextEditor
      value={value}
      onChange={onChange}
      formats={POSITION_DESCRIPTION_FORMATS}
      name="description"
      ariaLabel={t('positions.form.description')}
      placeholder={t('positions.description.placeholder')}
      testId="position-description-editor"
      namespace="PositionDescription"
    />
  );
}

export function PositionDescription({ html }: { html: string }) {
  const { t } = useTranslation();
  const descriptionRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);

  const toggleExpanded = () => {
    if (!expanded) {
      setExpanded(true);
      return;
    }
    setExpanded(false);
    window.requestAnimationFrame(() =>
      descriptionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  useEffect(() => {
    const description = descriptionRef.current;
    if (!description) return;
    const measure = () => setOverflows(description.scrollHeight > COLLAPSED_DESCRIPTION_HEIGHT);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(description);
    return () => observer.disconnect();
  }, [html]);

  return (
    <div className={`position-description-shell${expanded ? ' is-expanded' : ''}`}>
      <div
        ref={descriptionRef}
        className="position-description"
        data-testid="position-description"
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {overflows ? (
        <div className="position-description-toggle">
          <button type="button" aria-expanded={expanded} onClick={toggleExpanded}>
            {t(expanded ? 'positions.description.showLess' : 'positions.description.showMore')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
