import { useEffect, useRef, useState } from 'react';

/**
 * The Educación and Experiencia entry form, hidden until asked for (KTL-46 follow-up): «Nueva …»
 * or a row's «Editar» shows it, a successful write or a cancel hides it again. Focus moves to the
 * form's first field when it opens, and back to «Nueva …» when it closes.
 */
export function useEntryFormDisclosure<T extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  // Bumped on every show, so loading another entry into an open form refocuses it too.
  const [shown, setShown] = useState(0);
  const firstField = useRef<T>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (open) firstField.current?.focus();
    else if (wasOpen.current) opener.current?.focus();
    wasOpen.current = open;
  }, [open, shown]);

  return {
    open,
    firstField,
    opener,
    show: (): void => {
      setOpen(true);
      setShown((count) => count + 1);
    },
    hide: (): void => setOpen(false),
  };
}
