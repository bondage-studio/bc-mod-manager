import {Observable} from '@/infrastructure/pubsub/Observable';
import {t} from '@/i18n/i18n';

/**
 * ModalStore - UI state for the modal dialog stack.
 * Provides both callback-based and promise-based APIs for showing modals.
 */

export interface ModalState {
  id: string;
  prompt: string | Node;
  input?: { initial: string; readonly: boolean; type: "input" | "textarea" };
  callback: (action: string, inputValue?: string) => void;
  buttons?: { submit: string } & Record<string, string>;
}

export class ModalStore {
  private static modals: ModalState[] = [];
  private static modalIdCounter = 0;
  // No onListenerError: preserve the original un-guarded notify semantics
  // (a throwing listener propagates and aborts the remaining listeners).
  private static readonly observable = new Observable<ModalState[]>({
    emitOnSubscribe: true,
    getSnapshot: () => [...this.modals],
  });

  /**
   * Subscribe to modal state changes
   * @param listener - Function to call when modals change
   * @returns Unsubscribe function
   */
  static subscribe(listener: (modals: ModalState[]) => void): () => void {
    return this.observable.subscribe(listener);
  }

  /**
   * Open a modal with callback-based API
   * @param options - Modal configuration options
   */
  static open(options: ModalOptions): void {
    const modal: ModalState = {
      id: this.generateId(),
      prompt: options.prompt,
      input: options.input,
      callback: options.callback,
      buttons: options.buttons,
    };

    this.modals.push(modal);
    this.notify();
  }

  static confirm(
    prompt: string | Node,
    options?: { confirmLabel?: string; cancelLabel?: string },
  ): Promise<boolean> {
    return new Promise((resolve) => {
      this.open({
        prompt,
        buttons: {
          submit: options?.confirmLabel ?? t('button-ok'),
          cancel: options?.cancelLabel ?? t('button-cancel'),
        },
        callback: (action) => resolve(action === 'submit'),
      });
    });
  }

  static alert(prompt: string | Node, confirmLabel?: string): Promise<void> {
    return new Promise((resolve) => {
      this.open({
        prompt,
        buttons: {submit: confirmLabel ?? t('button-ok')},
        callback: () => resolve(),
      });
    });
  }

  static prompt(
    prompt: string | Node,
    options?: {
      initial?: string;
      type?: "input" | "textarea";
      readonly?: boolean;
      confirmLabel?: string;
      cancelLabel?: string;
    },
  ): Promise<string | null> {
    return new Promise((resolve) => {
      this.open({
        prompt,
        input: {
          initial: options?.initial ?? "",
          type: options?.type ?? "input",
          readonly: options?.readonly ?? false,
        },
        buttons: {
          submit: options?.confirmLabel ?? t('button-ok'),
          cancel: options?.cancelLabel ?? t('button-cancel'),
        },
        callback: (action, inputValue) => resolve(action === 'submit' ? inputValue ?? "" : null),
      });
    });
  }

  /**
   * Close a specific modal by ID
   * @param id - Modal ID to close
   */
  static close(id: string): void {
    const index = this.modals.findIndex(m => m.id === id);
    if (index !== -1) {
      this.modals.splice(index, 1);
      this.notify();
    }
  }

  /**
   * Close all modals
   */
  static closeAll(): void {
    this.modals = [];
    this.notify();
  }

  /**
   * Get all current modals
   */
  static getModals(): ModalState[] {
    return [...this.modals];
  }

  /**
   * Notify all listeners of state change
   */
  private static notify(): void {
    this.observable.notify([...this.modals]);
  }

  /**
   * Generate a unique modal ID
   */
  private static generateId(): string {
    return `modal_${Date.now()}_${this.modalIdCounter++}`;
  }
}
