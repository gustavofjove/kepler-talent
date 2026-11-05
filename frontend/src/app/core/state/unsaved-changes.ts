/**
 * Who on the current page holds work that is not saved yet (KTL-46 design D8). The auth layer
 * reads it to decide whether a refused session may send the user to sign-in, which would throw
 * that work away, or must keep the page and offer to sign in again in place.
 *
 * It is never rendered, so it holds plain fields rather than a signal.
 */
export class UnsavedChangesRegistry {
  private readonly owners = new Set<string>();
  private discarded = false;

  set(owner: string, dirty: boolean): void {
    if (dirty) {
      this.owners.add(owner);
      this.discarded = false;
    } else {
      this.owners.delete(owner);
    }
  }

  hasAny(): boolean {
    return this.owners.size > 0;
  }

  /** Gives the unsaved work up, e.g. when another user signs in on the page it belongs to. */
  discardAll(): void {
    this.owners.clear();
    this.discarded = true;
  }

  /** True after {@link discardAll} until someone holds unsaved work again: navigation may proceed. */
  wasDiscarded(): boolean {
    return this.discarded;
  }
}
