import { useState } from "react";
import { Popover } from "@cloudflare/kumo";
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
          className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-kumo-line px-2.5 py-2 text-xs font-medium text-kumo-subtle transition-colors hover:bg-kumo-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-accent/40 sm:text-sm ${
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
        <AuthDialog open={authOpen} onClose={() => setAuthOpen(false)} t={t} />
      </>
    );
  }

  return (
    <>
      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-kumo-line px-2.5 py-2 text-xs font-medium text-kumo-subtle transition-colors hover:bg-kumo-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-accent/40 sm:text-sm ${
              isTouchDevice ? "active:scale-95" : ""
            }`}
            style={{ minHeight: 44, minWidth: 44 }}
            aria-label={t("auth_user_menu")}
            title={t("auth_user_menu")}
          >
            <UserCircleIcon size={18} />
            <span className="hidden max-w-24 truncate sm:inline">{user?.username ?? t("auth_profile_title")}</span>
            <CaretDownIcon size={14} />
          </button>
        </Popover.Trigger>
        <Popover.Content className="w-52 p-2">
          <div className="flex flex-col gap-1">
            <button
              type="button"
              className="rounded-md px-3 py-2 text-left text-sm text-kumo-default transition-colors hover:bg-kumo-control"
              onClick={() => {
                setMenuOpen(false);
                setProfileOpen(true);
              }}
            >
              {t("auth_profile_action")}
            </button>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-kumo-default transition-colors hover:bg-kumo-control"
              onClick={() => {
                void onLogout();
              }}
            >
              <SignOutIcon size={16} />
              {t("auth_logout_action")}
            </button>
          </div>
        </Popover.Content>
      </Popover>

      <ProfileDialog open={profileOpen} onClose={() => setProfileOpen(false)} t={t} />
    </>
  );
}
