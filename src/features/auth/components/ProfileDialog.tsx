import { useEffect, useId, useMemo, useState } from "react";
import { Dialog } from "../../../components/ui/dialog";
import { cn } from "../../../components/ui/utils";
import { useAuth } from "../../chat/context/AuthContext";
import { useToast } from "../../../hooks/useToast";
import type { UiMessageKey } from "../../../i18n/ui";

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
  t: (key: UiMessageKey, vars?: Record<string, string>) => string;
}

export function ProfileDialog({ open, onClose, t }: ProfileDialogProps) {
  const { user, changePassword, isLoading, error, clearError } = useAuth();
  const { addToast } = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const formId = useId();

  useEffect(() => {
    if (!open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setLocalError(null);
      clearError();
    }
  }, [clearError, open]);

  const canSubmit = useMemo(
    () => Boolean(currentPassword && newPassword && confirmPassword),
    [confirmPassword, currentPassword, newPassword]
  );

  const onSubmit = async () => {
    if (newPassword !== confirmPassword) {
      setLocalError(t("auth_password_mismatch"));
      return;
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      setLocalError(t("auth_password_invalid"));
      return;
    }
    if (newPassword === currentPassword) {
      setLocalError(t("auth_password_same_as_old"));
      return;
    }

    try {
      setLocalError(null);
      await changePassword(currentPassword, newPassword);
      addToast(t("auth_change_password_success"), "success");
      onClose();
    } catch {
      // Error state is managed by AuthContext.
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("auth_profile_title")}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg border border-border bg-muted px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border"
          >
            {t("message_actions_cancel")}
          </button>
          <button
            type="submit"
            form={formId}
            disabled={!canSubmit || isLoading}
            className={cn(
              "inline-flex items-center justify-center rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              (!canSubmit || isLoading) && "cursor-not-allowed opacity-50"
            )}
          >
            {t("auth_change_password_action")}
          </button>
        </div>
      }
    >
      <form
        id={formId}
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit();
        }}
      >
        <div className="rounded-xl border border-border bg-muted/40 p-3">
          <span className="text-sm text-foreground-muted">
            {t("auth_profile_username")}
          </span>
          <p className="mt-1 text-sm font-medium text-foreground">{user?.username ?? "-"}</p>
          <div className="mt-2">
            <span className="text-sm text-foreground-muted">
              {t("auth_profile_created_at")}
            </span>
          </div>
          <p className="mt-1 text-sm text-foreground">
            {user?.createdAt ? new Date(user.createdAt).toLocaleString() : "-"}
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-sm text-foreground-muted">
            {t("auth_current_password")}
          </span>
          <input
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            type="password"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            placeholder={t("auth_current_password_placeholder")}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-foreground-muted">
            {t("auth_new_password")}
          </span>
          <input
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            type="password"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            placeholder={t("auth_new_password_placeholder")}
          />
        </label>

        <label className="block space-y-1">
          <span className="text-sm text-foreground-muted">
            {t("auth_password_confirm")}
          </span>
          <input
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            type="password"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-accent"
            placeholder={t("auth_password_confirm_placeholder")}
          />
        </label>

        {localError || error ? (
          <p className="rounded-lg border border-red-300/70 bg-red-50/80 px-3 py-2 text-sm text-red-700">
            {localError ?? error}
          </p>
        ) : null}
      </form>
    </Dialog>
  );
}
