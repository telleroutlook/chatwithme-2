import { useEffect, useId, useMemo, useState } from "react";
import { Button, Text } from "@cloudflare/kumo";
import { Dialog } from "../../../components/ui/dialog";
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
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("message_actions_cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            variant="primary"
            disabled={!canSubmit || isLoading}
          >
            {t("auth_change_password_action")}
          </Button>
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
        <div className="rounded-xl border border-kumo-line bg-kumo-control/40 p-3">
          <Text size="sm" variant="secondary">
            {t("auth_profile_username")}
          </Text>
          <p className="mt-1 text-sm font-medium text-kumo-default">{user?.username ?? "-"}</p>
          <div className="mt-2">
            <Text size="sm" variant="secondary">
              {t("auth_profile_created_at")}
            </Text>
          </div>
          <p className="mt-1 text-sm text-kumo-default">
            {user?.createdAt ? new Date(user.createdAt).toLocaleString() : "-"}
          </p>
        </div>

        <label className="block space-y-1">
          <Text size="sm" variant="secondary">
            {t("auth_current_password")}
          </Text>
          <input
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            autoComplete="current-password"
            type="password"
            className="w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-sm text-kumo-default outline-none focus:border-kumo-accent"
            placeholder={t("auth_current_password_placeholder")}
          />
        </label>

        <label className="block space-y-1">
          <Text size="sm" variant="secondary">
            {t("auth_new_password")}
          </Text>
          <input
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            autoComplete="new-password"
            type="password"
            className="w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-sm text-kumo-default outline-none focus:border-kumo-accent"
            placeholder={t("auth_new_password_placeholder")}
          />
        </label>

        <label className="block space-y-1">
          <Text size="sm" variant="secondary">
            {t("auth_password_confirm")}
          </Text>
          <input
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
            type="password"
            className="w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-sm text-kumo-default outline-none focus:border-kumo-accent"
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
