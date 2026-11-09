import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { viewerUrl } from './candidate-cv-preview.logic';
import { isPdfFile } from './held-cv-preview.logic';
import './candidate-cv-preview.css';

interface HeldCvPreviewProps {
  /** The CV the create page holds after a returned draft (KTL-42), so already scanned clean. */
  file: File;
}

/**
 * The create page's preview of the CV just read (KTL-47). It renders the file the browser already
 * holds: nothing is uploaded, requested or stored. It reuses the `.cv-preview` classes so the
 * page-split layout places it beside the form.
 */
export function HeldCvPreview({ file }: HeldCvPreviewProps) {
  const { t } = useTranslation();
  const pdf = isPdfFile(file);
  const [objectUrl, setObjectUrl] = useState<string>();

  useEffect(() => {
    if (!pdf) {
      setObjectUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, pdf]);

  return (
    <section className="panel cv-preview" data-testid="held-cv-preview">
      <h2>{t('candidate.cvDraft.preview.title')}</h2>
      {pdf ? (
        objectUrl ? (
          <object
            type="application/pdf"
            data={viewerUrl(objectUrl)}
            data-testid="held-cv-preview-viewer"
            aria-label={t('candidate.cvDraft.preview.viewerLabel')}
            title={t('candidate.cvDraft.preview.viewerLabel')}
            className="cv-preview__viewer"
          >
            <p>{t('candidate.cvDraft.preview.fallback')}</p>
          </object>
        ) : null
      ) : (
        <div className="empty-state" data-testid="held-cv-preview-unsupported">
          <p className="cv-preview__filename">{file.name}</p>
          <p>{t('candidate.cvDraft.preview.pdfOnly')}</p>
        </div>
      )}
    </section>
  );
}
