import { globalModalStore, generateModalId, type ModalConfig, type ModalInstance } from "./types";

// ============ Imperative Modal API ============

/**
 * Create a modal imperatively (without JSX)
 *
 * @example
 * ```tsx
 * const modal = createModal({
 *   title: 'Confirm Delete',
 *   content: <div>Are you sure?</div>,
 * });
 *
 * // Update modal
 * modal.update({ title: 'New Title' });
 *
 * // Close modal
 * modal.close();
 *
 * // Destroy modal immediately
 * modal.destroy();
 * ```
 */
export function createModal(config: ModalConfig): ModalInstance {
  const id = config.id || generateModalId();
  const animationDuration = config.animationDuration ?? 200;

  const instance: ModalInstance = {
    ...config,
    id,
    visible: true,
    closable: config.closable ?? true,
    maskClosable: config.maskClosable ?? true,
    mask: config.mask ?? true,
    centered: config.centered ?? true,
    destroyOnClose: config.destroyOnClose ?? false,
    animationDuration,
    width: config.width ?? 520,
    update: (newConfig) => {
      const state = globalModalStore.getState();
      const modals = state.modals.map((modal) => {
        if (modal.id === id) {
          return { ...modal, ...newConfig };
        }
        return modal;
      });
      globalModalStore.setState({ modals });
    },
    close: async () => {
      const state = globalModalStore.getState();
      const modal = state.modals.find((m) => m.id === id);

      if (!modal) return;

      // Call onClose callback
      await modal.onClose?.();

      // Set visible to false (triggers close animation)
      const modals = state.modals.map((m) => {
        if (m.id === id) {
          return { ...m, visible: false };
        }
        return m;
      });
      globalModalStore.setState({ modals });

      // Remove after animation
      setTimeout(() => {
        const currentState = globalModalStore.getState();
        globalModalStore.setState({
          modals: currentState.modals.filter((m) => m.id !== id)
        });
        modal.afterClose?.();
      }, animationDuration);
    },
    destroy: () => {
      const state = globalModalStore.getState();
      const modal = state.modals.find((m) => m.id === id);

      globalModalStore.setState({
        modals: state.modals.filter((m) => m.id !== id)
      });

      modal?.afterClose?.();
    }
  };

  // Add to store
  const state = globalModalStore.getState();
  globalModalStore.setState({
    modals: [...state.modals, instance]
  });

  // Call onOpen callback
  config.onOpen?.();

  return instance;
}

// ============ Confirm Modal ============

export interface ConfirmConfig {
  title?: React.ReactNode;
  content: React.ReactNode;
  okText?: string;
  cancelText?: string;
  onOk?: () => void | Promise<void>;
  onCancel?: () => void;
  danger?: boolean;
}

/**
 * Create a confirmation modal
 *
 * @example
 * ```tsx
 * const confirmed = await confirm({
 *   title: 'Delete Item',
 *   content: 'Are you sure you want to delete this item?',
 *   okText: 'Delete',
 *   danger: true,
 * });
 * ```
 */
export function confirm(config: ConfirmConfig): Promise<boolean> {
  return new Promise((resolve) => {
    let modalInstance: ModalInstance | null = null;

    const handleOk = async () => {
      await config.onOk?.();
      modalInstance?.close();
      resolve(true);
    };

    const handleCancel = () => {
      config.onCancel?.();
      modalInstance?.close();
      resolve(false);
    };

    modalInstance = createModal({
      title: config.title || "Confirm",
      content: config.content,
      width: 400,
      footer: (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className="inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors border border-border bg-surface-elevated hover:bg-muted text-foreground h-8 px-3 disabled:pointer-events-none disabled:opacity-50"
          >
            {config.cancelText || "Cancel"}
          </button>
          <button
            type="button"
            onClick={handleOk}
            className={`inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors h-8 px-3 disabled:pointer-events-none disabled:opacity-50 ${
              config.danger
                ? "bg-[var(--app-color-danger)] text-white hover:bg-[var(--app-color-danger)]/90 shadow-sm"
                : "bg-accent text-white hover:bg-accent/90 shadow-sm"
            }`}
          >
            {config.okText || "OK"}
          </button>
        </div>
      ),
      closable: true,
      maskClosable: false
    });
  });
}

// ============ Alert Modal ============

export interface AlertConfig {
  title?: React.ReactNode;
  content: React.ReactNode;
  okText?: string;
  onOk?: () => void;
}

/**
 * Create an alert modal
 *
 * @example
 * ```tsx
 * await alert({
 *   title: 'Success',
 *   content: 'Your changes have been saved.',
 * });
 * ```
 */
export function alert(config: AlertConfig): Promise<void> {
  return new Promise((resolve) => {
    let modalInstance: ModalInstance | null = null;

    const handleOk = () => {
      config.onOk?.();
      modalInstance?.close();
      resolve();
    };

    modalInstance = createModal({
      title: config.title || "Alert",
      content: config.content,
      width: 400,
      footer: (
        <button
          type="button"
          onClick={handleOk}
          className="inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors bg-accent text-white hover:bg-accent/90 shadow-sm h-8 px-3 disabled:pointer-events-none disabled:opacity-50"
        >
          {config.okText || "OK"}
        </button>
      ),
      closable: true,
      maskClosable: false
    });
  });
}

// ============ Export Types ============

export type { ModalConfig, ModalInstance };
