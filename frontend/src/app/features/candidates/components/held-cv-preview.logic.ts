/**
 * Whether a CV held on the create page (KTL-47) is shown in the PDF viewer. The extension is
 * enough: the CV-draft operation has already refused any file whose content does not match it,
 * and browsers report DOCX MIME types inconsistently.
 */
export function isPdfFile(file: Pick<File, 'name'>): boolean {
  return file.name.toLowerCase().endsWith('.pdf');
}
