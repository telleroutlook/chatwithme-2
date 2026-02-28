import { globalModalStore, generateModalId, type ModalConfig, type ModalInstance } from "./types";
import { Button } from "@cloudflare/kumo";

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
          modals: currentState.modals.filter((m) => m.id !== id),
        });
        modal.afterClose?.();
      }, animationDuration);
    },
    destroy: () => {
      const state = globalModalStore.getState();
      const modal = state.modals.find((m) => m.id === id);

      globalModalStore.setState({
        modals: state.modals.filter((m) => m.id !== id),
      });

      modal?.afterClose?.();
    },
  };

  // Add to store
  const state = globalModalStore.getState();
  globalModalStore.setState({
    modals: [...state.modals, instance],
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
          <Button variant="secondary" onClick={handleCancel}>
            {config.cancelText || "Cancel"}
          </Button>
          <Button
            variant={config.danger ? "destructive" : "primary"}
            onClick={handleOk}
          >
            {config.okText || "OK"}
          </Button>
        </div>
      ),
      closable: true,
      maskClosable: false,
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
        <Button variant="primary" onClick={handleOk}>
          {config.okText || "OK"}
        </Button>
      ),
      closable: true,
      maskClosable: false,
    });
  });
}

// ============ Export Types ============

export type { ModalConfig, ModalInstance };
