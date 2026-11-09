# KTL-47: Preview the CV just read on «Nuevo candidato»

The CV picked in «Rellenar desde un CV» is now shown next to the form once it has been read, so
values the extraction missed or got wrong can be checked, copied or typed with the original in
view. This helps most with scanned CVs, which fill no fields at all.

**When it appears.** Only after the application has read the CV, which means the antivirus scan
has reported it clean. That includes a scanned CV without a text layer. While the CV is being read,
and for any CV the application refuses (format, size, antivirus, scanner unavailable, timeout, or a
CV too long to read automatically), no preview is shown. Picking another file removes the current
preview at once. The new one appears when that file has been read. The preview does not depend on
«Adjuntar este CV al candidato» and stays if the box is cleared.

**PDF and DOCX.** A PDF opens in the browser's own viewer, fitted to the panel width. Browsers
cannot display DOCX files, so for a DOCX the panel shows the file name and «La vista previa solo
está disponible para CV en PDF.» If the browser has no PDF viewer, the panel says «El navegador no
puede mostrar este PDF.» No download is offered, because the file is already on the user's machine.

**Layout.** This page has its own breakpoint. From a content area of 1024 px (a browser window of
about 1070 px), the preview is a column to the right of the form that stays in view while the form
scrolls. Narrower windows show it after the form. Before a CV is read the page looks as it did. The
candidate page is unchanged and keeps its preview beside the sections only from 1360 px.

**Permissions.** No new permission. The preview is available to everyone who can create
candidates, whether or not they hold `documents.upload` or `documents.download`.

**Privacy and storage.** The preview shows the file the browser already holds. Nothing is uploaded
or requested for it, and nothing is stored before «Guardar». The file, its name and its content
are never written to browser storage, the URL or logs. The local reference used to display it is
released when the file is replaced or the page is left.

**Deployment.** Frontend only. No API contract, database migration, grant, configuration or
dependency change.

Background: [KTL-42 release notes](../ktl-42/release-notes.md).
