import type { ReactNode } from "react";

// ============ Modal Types ============

export type ModalId = string | number;

export interface ModalConfig {
  /** Unique identifier for the modal */
  id?: ModalId;
  /** Modal title */
  title?: ReactNode;
  /** Modal content */
  content: ReactNode;
  /** Modal width (px or string) */
  width?: number | string;
  /** Modal max width */
  maxWidth?: number | string;
  /** Whether to show close button */
  closable?: boolean;
  /** Whether clicking mask closes modal */
  maskClosable?: boolean;
  /** Whether to show mask */
  mask?: boolean;
  /** Custom class name */
  className?: string;
  /** Z-index for modal */
  zIndex?: number;
  /** Called when modal is about to close */
  onClose?: () => void | Promise<void>;
  /** Called after modal is closed */
  afterClose?: () => void;
  /** Called when modal is opened */
  onOpen?: () => void;
  /** Footer content (null for no footer) */
  footer?: ReactNode | null;
  /** Whether modal is centered */
  centered?: boolean;
  /** Whether to destroy modal on close */
  destroyOnClose?: boolean;
  /** Animation duration in ms */
  animationDuration?: number;
}

export interface ModalInstance extends ModalConfig {
  /** Modal ID (auto-generated if not provided) */
  id: ModalId;
  /** Whether modal is visible */
  visible: boolean;
  /** Update modal config */
  update: (config: Partial<ModalConfig>) => void;
  /** Close the modal */
  close: () => void;
  /** Destroy the modal completely */
  destroy: () => void;
}

export interface ModalStackState {
  modals: ModalInstance[];
}

// = createStore for modal state management ============

type Listener = () => void;

export interface ModalStore {
  getState: () => ModalStackState;
  setState: (state: Partial<ModalStackState>) => void;
  subscribe: (listener: Listener) => () => void;
}

export function createModalStore(initialState: ModalStackState): ModalStore {
  let state = initialState;
  const listeners = new Set<Listener>();

  return {
    getState: () => state,
    setState: (newState) => {
      state = { ...state, ...newState };
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// ============ Global Modal Store ============

export const globalModalStore = createModalStore({
  modals: [],
});

// = Modal ID Generator ============

let modalIdCounter = 0;

export function generateModalId(): ModalId {
  return `modal-${++modalIdCounter}`;
}
