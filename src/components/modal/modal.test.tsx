import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { createModal } from "./createModal";
import { ModalHost } from "./ModalHost";
import { globalModalStore } from "./types";

// Mock createPortal
vi.mock("react-dom", async () => {
  const actual = await vi.importActual("react-dom");
  return {
    ...actual,
    createPortal: (children: React.ReactNode) => children
  };
});

describe("Modal System", () => {
  beforeEach(() => {
    // Clear modal store before each test
    globalModalStore.setState({ modals: [] });
    // Create a container for modals
    const container = document.createElement("div");
    container.id = "modal-root";
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clean up
    const container = document.getElementById("modal-root");
    if (container) {
      document.body.removeChild(container);
    }
  });

  describe("createModal", () => {
    it("should create a modal with default options", () => {
      const modal = createModal({
        content: "Test Content"
      });

      expect(modal.id).toBeDefined();
      expect(modal.visible).toBe(true);
      expect(modal.closable).toBe(true);
      expect(modal.mask).toBe(true);
      expect(modal.centered).toBe(true);
    });

    it("should create a modal with custom options", () => {
      const modal = createModal({
        id: "test-modal",
        title: "Test Title",
        content: "Test Content",
        width: 600,
        closable: false,
        maskClosable: false
      });

      expect(modal.id).toBe("test-modal");
      expect(modal.title).toBe("Test Title");
      expect(modal.width).toBe(600);
      expect(modal.closable).toBe(false);
      expect(modal.maskClosable).toBe(false);
    });

    it("should call onOpen callback when created", () => {
      const onOpen = vi.fn();
      createModal({
        content: "Test",
        onOpen
      });

      expect(onOpen).toHaveBeenCalled();
    });

    it("should update modal config", () => {
      const modal = createModal({
        content: "Test",
        title: "Original Title"
      });

      modal.update({ title: "Updated Title" });

      const state = globalModalStore.getState();
      const updatedModal = state.modals.find((m) => m.id === modal.id);
      expect(updatedModal?.title).toBe("Updated Title");
    });

    it("should close modal", async () => {
      const modal = createModal({
        content: "Test"
      });

      modal.close();

      await waitFor(() => {
        const state = globalModalStore.getState();
        const closedModal = state.modals.find((m) => m.id === modal.id);
        expect(closedModal?.visible).toBe(false);
      });
    });

    it("should destroy modal immediately", () => {
      const modal = createModal({
        content: "Test"
      });

      modal.destroy();

      const state = globalModalStore.getState();
      expect(state.modals.find((m) => m.id === modal.id)).toBeUndefined();
    });
  });

  describe("ModalHost", () => {
    it("should render without crashing", () => {
      render(<ModalHost />);
      // ModalHost should render but be empty initially
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });
});
