import { useCallback, useEffect, useRef, useState } from "react";
import { CaretDownIcon, SignOutIcon, UserCircleIcon } from "@phosphor-icons/react";
import { useAuth } from "../../chat/context/AuthContext";
import { useToast } from "../../../hooks/useToast";
import { AuthDialog } from "./AuthDialog";
import { ProfileDialog } from "./ProfileDialog";
import type { UiMessageKey } from "../../../i18n/ui";

interface UserMenuProps {
  t: (key: UiMessageKey, vars?: Record<string, string>) => string;
  isTouchDevice: boolean;
}

export function UserMenu({ t, isTouchDevice }: UserMenuProps) {
  const { isAuthenticated, isLoading, user, logout } = useAuth();
  const { addToast } = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const closeAuthDialog = useCallback(() => setAuthOpen(false), []);
  const closeProfileDialog = useCallback(() => setProfileOpen(false), []);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  const onLogout = async () => {
    await logout();
    setMenuOpen(false);
    addToast(t("auth_logout_success"), "success");
  };

  if (!isAuthenticated) {
    return (
      <>
        <button
          type="button"
          onClick={() => setAuthOpen(true)}
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs font-medium text-foreground-muted transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:text-sm ${
            isTouchDevice ? "active:scale-95" : ""
          }`}
          style={{ minHeight: 44, minWidth: 44 }}
          aria-label={t("auth_login_action")}
          title={t("auth_login_action")}
          disabled={isLoading}
        >
          <UserCircleIcon size={18} />
          <span className="hidden sm:inline">{t("auth_login_action")}</span>
        </button>
        <AuthDialog open={authOpen} onClose={closeAuthDialog} t={t} />
      </>
    );
  }

  return (
    <>
      <div ref={menuRef} className="relative">
        <button
          type="button"
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs font-medium text-foreground-muted transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 sm:text-sm ${
            isTouchDevice ? "active:scale-95" : ""
          }`}
          style={{ minHeight: 44, minWidth: 44 }}
          aria-label={t("auth_user_menu")}
          title={t("auth_user_menu")}
          onClick={() => setMenuOpen((prev) => !prev)}
        >
          <UserCircleIcon size={18} />
          <span className="hidden max-w-24 truncate sm:inline">{user?.username ?? t("auth_profile_title")}</span>
          <CaretDownIcon size={14} />
        </button>
        {menuOpen && (
          <div className="absolute right-0 z-50 mt-1 w-52 rounded-xl border border-border bg-surface-elevated p-2 shadow-lg">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                className="rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                onClick={() => {
                  setMenuOpen(false);
                  setProfileOpen(true);
                }}
              >
                {t("auth_profile_action")}
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted"
                onClick={() => {
                  void onLogout();
                }}
              >
                <SignOutIcon size={16} />
                {t("auth_logout_action")}
              </button>
            </div>
          </div>
        )}
      </div>

      <ProfileDialog open={profileOpen} onClose={closeProfileDialog} t={t} />
    </>
  );
}
