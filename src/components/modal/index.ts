// Modal System - Imperative API
// Inspired by lobe-ui's modal implementation

// Types
export type { ModalConfig, ModalInstance, ModalId, ModalStackState } from "./types";

// Hook-based API (for components)
export { useModalStack } from "./useModalStack";

// Imperative API (for non-component usage)
export { createModal, confirm, alert } from "./createModal";
export type { ConfirmConfig, AlertConfig } from "./createModal";

// Host component (render once in app root)
export { ModalHost, Modal } from "./ModalHost";

// Store (for advanced usage)
export { globalModalStore, createModalStore, generateModalId } from "./types";
