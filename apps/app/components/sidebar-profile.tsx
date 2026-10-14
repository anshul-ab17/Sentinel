"use client";

import { useEffect, useState } from "react";
import { Menu } from "@base-ui/react/menu";

import { BrandLogo } from "@app/components/brand-logo";
import { Icon } from "@app/components/icon";
import { useSidebar } from "@app/components/ui/sidebar";
import { getWallets } from "@app/components/wallet-session";

type WalletProfile = { address: string; name: string; icon?: string };

export function SidebarProfile({ onSettings }: { onSettings: () => void }) {
  const { open, isMobile, setOpenMobile } = useSidebar();
  const [profile, setProfile] = useState<WalletProfile | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/v1/me", { credentials: "same-origin" });
        if (!response.ok) {
          if (active) setProfile(null);
          return;
        }
        const { wallets } = (await response.json()) as { wallets: { address: string }[] };
        const address = wallets[0]?.address;
        if (!address) {
          if (active) setProfile(null);
          return;
        }
        const wallet = getWallets()
          .get()
          .find((candidate) => candidate.accounts.some((account) => account.address === address));
        if (active)
          setProfile({ address, name: wallet?.name ?? "Connected wallet", icon: wallet?.icon });
      } catch {
        if (active) setProfile(null);
      }
    };
    void refresh();
    window.addEventListener("sentinel-session", refresh);
    return () => {
      active = false;
      window.removeEventListener("sentinel-session", refresh);
    };
  }, []);

  const shortAddress = profile
    ? `${profile.address.slice(0, 4)}…${profile.address.slice(-4)}`
    : null;
  return (
    <Menu.Root>
      <Menu.Trigger
        className="sidebar-profile"
        aria-label={profile ? `Wallet profile ${shortAddress}` : "Open profile menu"}
      >
        {profile?.icon ? (
          <img className="sidebar-profile-wallet-icon" src={profile.icon} alt="" />
        ) : (
          <BrandLogo size={32} />
        )}
        <span className="sidebar-profile-copy">
          <strong className={profile ? "font-technical" : undefined} title={profile?.address}>
            {shortAddress ?? "Sentinel"}
          </strong>
          <small>{profile?.name ?? "Investigation workspace"}</small>
        </span>
        <svg
          className="sidebar-profile-chevron"
          width="14"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m8 8 4-4 4 4m-8 8 4 4 4-4" />
        </svg>
      </Menu.Trigger>
      <Menu.Portal>
        <div className="dashboard-shell sidebar-portal-theme">
          <Menu.Positioner
            side={open || isMobile ? "top" : "right"}
            align="end"
            sideOffset={8}
            className="sidebar-profile-positioner"
          >
            <Menu.Popup className="sidebar-profile-menu">
              <Menu.Group>
                <Menu.GroupLabel className="sidebar-profile-menu-label">
                  {shortAddress ?? "Sentinel workspace"}
                </Menu.GroupLabel>
                <Menu.Item
                  className="sidebar-profile-menu-item"
                  onClick={() => {
                    onSettings();
                    if (isMobile) setOpenMobile(false);
                  }}
                >
                  <Icon name="settings" size={16} />
                  <span>Settings</span>
                </Menu.Item>
              </Menu.Group>
            </Menu.Popup>
          </Menu.Positioner>
        </div>
      </Menu.Portal>
    </Menu.Root>
  );
}
