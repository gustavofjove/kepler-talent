import { useCallback, useRef, useState } from 'react';
import { AppError } from '../../shared/models/error.models';
import { useServices } from '../di/services-context';

type Action = () => Promise<void> | void;

export interface SessionRetry {
  /** The panel's last action was refused because the session ended; the draft is kept. */
  expired: boolean;
  /**
   * Takes `error` when it is the end of the session the auth layer kept the page for (KTL-46),
   * remembering `retry` to run after signing in again. Returns false for any other error.
   */
  handle: (error: unknown, retry?: Action) => boolean;
  /** Opens the sign-in over the page; signed in as the same user, runs the remembered action once. */
  signIn: () => Promise<void>;
}

/**
 * A candidate panel's side of the sign-in in place (KTL-46 design D8). The retry runs once per
 * sign-in: a second refusal shows the notice again instead of looping.
 */
export function useSessionRetry(): SessionRetry {
  const { authService } = useServices();
  const [expired, setExpired] = useState(false);
  const retry = useRef<Action | undefined>(undefined);

  const handle = useCallback(
    (error: unknown, action?: Action): boolean => {
      if (
        !(error instanceof AppError) ||
        error.code !== 'UNAUTHENTICATED' ||
        !authService.sessionExpired()
      ) {
        return false;
      }
      retry.current = action;
      setExpired(true);
      return true;
    },
    [authService],
  );

  const signIn = useCallback(async (): Promise<void> => {
    const outcome = await authService.promptSignIn();
    if (outcome === 'cancelled') return;
    setExpired(false);
    const action = retry.current;
    retry.current = undefined;
    if (outcome === 'same') await action?.();
  }, [authService]);

  return { expired, handle, signIn };
}
