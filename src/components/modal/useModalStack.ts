import { useSyncExternalStore, useCallback, useMemo } from "react";
import {
  globalModalStore,
  generateModalId,
  type ModalConfig,
  type ModalInstance,
} from "./types";

// ============ Hook ============

/**
 * Hook for managing modal stack
 *
 * Provides imperative API for creating, updating, and closing modals
 */
export function useModalStack() {
  // Subscribe to store changes
  const modals = useSyncExternalStore(
    (callback) => globalModalStore.subscribe(callback),
    () => globalModalStore.getState().modals
  );

  // Create a new modal
  const create = useCallback((config: ModalConfig): ModalInstance => {
    const id = config.id || generateModalId();
    const instance: ModalInstance = {
      ...config,
      id,
      visible: true,
      closable: config.closable ?? true,
      maskClosable: config.maskClosable ?? true,
      mask: config.mask ?? true,
      centered: config.centered ?? true,
      destroyOnClose: config.destroyOnClose ?? false,
      animationDuration: config.animationDuration ?? 200,
      update: (newConfig) => updateModal(id, newConfig),
      close: () => closeModal(id),
      destroy: () => destroyModal(id),
    };

    const state = globalModalStore.getState();
    globalModalStore.setState({
      modals: [...state.modals, instance],
    });

    config.onOpen?.();

    return instance;
  }, []);

  // Update existing modal
  const updateModal = useCallback((id: ModalInstance["id"], config: Partial<ModalConfig>) => {
    const state = globalModalStore.getState();
    const modals = state.modals.map((modal) => {
      if (modal.id === id) {
        return { ...modal, ...config };
      }
      return modal;
    });
    globalModalStore.setState({ modals });
  }, []);

  // Close modal (with animation)
  const closeModal = useCallback(async (id: ModalInstance["id"]) => {
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
    const duration = modal.animationDuration || 200;
    setTimeout(() => {
      const currentState = globalModalStore.getState();
      globalModalStore.setState({
        modals: currentState.modals.filter((m) => m.id !== id),
      });
      modal.afterClose?.();
    }, duration);
  }, []);

  // Destroy modal immediately (no animation)
  const destroyModal = useCallback((id: ModalInstance["id"]) => {
    const state = globalModalStore.getState();
    const modal = state.modals.find((m) => m.id === id);

    globalModalStore.setState({
      modals: state.modals.filter((m) => m.id !== id),
    });

    modal?.afterClose?.();
  }, []);

  // Close all modals
  const closeAll = useCallback(async () => {
    const state = globalModalStore.getState();

    // Close all with animation
    globalModalStore.setState({
      modals: state.modals.map((m) => ({ ...m, visible: false })),
    });

    // Wait for animations
    const maxDuration = Math.max(
      ...state.modals.map((m) => m.animationDuration || 200)
    );

    setTimeout(() => {
      globalModalStore.setState({ modals: [] });
    }, maxDuration);
  }, []);

  // Get topmost modal
  const topModal = useMemo(() => {
    return modals[modals.length - 1] || null;
  }, [modals]);

  // Check if any modal is open
  const hasModals = modals.length > 0;

  return {
    modals,
    create,
    update: updateModal,
    close: closeModal,
    destroy: destroyModal,
    closeAll,
    topModal,
    hasModals,
  };
}

// ============ Types ============

export type { ModalConfig, ModalInstance };
