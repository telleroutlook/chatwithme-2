import { useEffect, useMemo, useState } from "react";
import { Button, Text } from "@cloudflare/kumo";
import { Dialog } from "../../../components/ui/dialog";
import { useAuth } from "../../chat/context/AuthContext";
import { useToast } from "../../../hooks/useToast";
import type { UiMessageKey } from "../../../i18n/ui";

interface AuthDialogProps {
  open: boolean;
  onClose: () => void;
  t: (key: UiMessageKey, vars?: Record<string, string>) => string;
}

type AuthMode = "login" | "register";

const usernamePattern = /^[a-zA-Z0-9_-]+$/;

export function AuthDialog({ open, onClose, t }: AuthDialogProps) {
  const { login, register, isLoading, error, clearError } = useAuth();
  const { addToast } = useToast();
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setUsername("");
      setPassword("");
      setConfirmPassword("");
      setLocalError(null);
      clearError();
      setMode("login");
    }
  }, [clearError, open]);

  const title = mode === "login" ? t("auth_login_title") : t("auth_register_title");
  const submitLabel = mode === "login" ? t("auth_login_action") : t("auth_register_action");

  const canSubmit = useMemo(() => {
    if (!username.trim() || !password) {
      return false;
    }
    if (mode === "register" && !confirmPassword) {
      return false;
    }
    return true;
  }, [confirmPassword, mode, password, username]);

  const validate = (): string | null => {
    const normalized = username.trim();
    if (normalized.length < 3 || normalized.length > 32 || !usernamePattern.test(normalized)) {
      return t("auth_username_invalid");
    }
    if (password.length < 8 || password.length > 128) {
      return t("auth_password_invalid");
    }
    if (mode === "register" && password !== confirmPassword) {
      return t("auth_password_mismatch");
    }
    return null;
  };

  const onSubmit = async () => {
    const nextError = validate();
    if (nextError) {
      setLocalError(nextError);
      return;
    }

    try {
      setLocalError(null);
      if (mode === "login") {
        await login(username.trim(), password);
        addToast(t("auth_login_success"), "success");
      } else {
        await register(username.trim(), password);
        addToast(t("auth_register_success"), "success");
      }
      onClose();
    } catch {
      // Error state is managed by AuthContext.
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            {t("message_actions_cancel")}
          </Button>
          <Button variant="primary" disabled={!canSubmit || isLoading} onClick={onSubmit}>
            {submitLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <label className="block space-y-1">
          <Text size="sm" variant="secondary">
            {t("auth_username")}
          </Text>
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            className="w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-sm text-kumo-default outline-none focus:border-kumo-accent"
            placeholder={t("auth_username_placeholder")}
          />
        </label>

        <label className="block space-y-1">
          <Text size="sm" variant="secondary">
            {t("auth_password")}
          </Text>
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            type="password"
            className="w-full rounded-lg border border-kumo-line bg-kumo-base px-3 py-2 text-sm text-kumo-default outline-none focus:border-kumo-accent"
            placeholder={t("auth_password_placeholder")}
          />
        </label>

        {mode === "register" ? (
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
        ) : null}

        {localError || error ? (
          <p className="rounded-lg border border-red-300/70 bg-red-50/80 px-3 py-2 text-sm text-red-700">
            {localError ?? error}
          </p>
        ) : null}

        <div className="pt-1 text-sm text-kumo-subtle">
          {mode === "login" ? t("auth_need_account") : t("auth_have_account")} {" "}
          <button
            type="button"
            className="font-medium text-kumo-accent hover:underline"
            onClick={() => {
              clearError();
              setLocalError(null);
              setMode(mode === "login" ? "register" : "login");
            }}
          >
            {mode === "login" ? t("auth_switch_register") : t("auth_switch_login")}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
