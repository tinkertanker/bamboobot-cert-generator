import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import { LogOut, Settings, ChevronDown, Shield } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';

export function UserAvatarDropdown() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((returnFocus: boolean) => {
    setIsOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }, []);
  const closeOnOutsideClick = useCallback(() => close(false), [close]);

  // Close dropdown when clicking outside
  useClickOutside([dropdownRef, buttonRef], closeOnOutsideClick, isOpen);

  const getMenuItems = () =>
    Array.from(
      dropdownRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []
    );

  // Move focus into the menu when it opens so keyboard users can act on it.
  useEffect(() => {
    if (isOpen) getMenuItems()[0]?.focus();
  }, [isOpen]);

  const handleMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = getMenuItems();
    const index = items.indexOf(document.activeElement as HTMLElement);
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close(true);
        break;
      case 'Tab':
        close(false);
        break;
      case 'ArrowDown':
        e.preventDefault();
        items[(index + 1) % items.length]?.focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        items[(index - 1 + items.length) % items.length]?.focus();
        break;
      case 'Home':
        e.preventDefault();
        items[0]?.focus();
        break;
      case 'End':
        e.preventDefault();
        items[items.length - 1]?.focus();
        break;
    }
  };

  const handleButtonKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' && !isOpen) {
      e.preventDefault();
      setIsOpen(true);
    } else if (e.key === 'Escape' && isOpen) {
      e.preventDefault();
      close(true);
    }
  };

  if (!session?.user) return null;

  const tier = session.user.tier;
  const canAccessAdmin = tier === 'admin' || tier === 'super_admin';

  // Get initials from user name or email
  const getInitials = () => {
    const name = session.user?.name || session.user?.email || '';
    if (!name) return 'U';

    const parts = name.split(/[\s@]/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Get background color based on email hash (consistent color per user)
  const getAvatarColor = () => {
    const email = session.user?.email || '';
    let hash = 0;
    for (let i = 0; i < email.length; i++) {
      hash = email.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colors = [
      'bg-purple-600',
      'bg-blue-600',
      'bg-green-600',
      'bg-yellow-600',
      'bg-red-600',
      'bg-indigo-600',
      'bg-pink-600',
      'bg-teal-600'
    ];
    return colors[Math.abs(hash) % colors.length];
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleButtonKeyDown}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-controls={isOpen ? 'user-account-menu' : undefined}
        aria-label={`Account menu for ${session.user.name || session.user.email || 'your account'}`}
      >
        {/* Avatar */}
        <div aria-hidden="true" className={`w-8 h-8 rounded-full ${getAvatarColor()} flex items-center justify-center text-white text-sm font-medium`}>
          {session.user?.image ? (
            // eslint-disable-next-line @next/next/no-img-element -- small remote OAuth avatar; next/image would need remotePatterns for every provider
            <img
              src={session.user.image}
              alt=""
              referrerPolicy="no-referrer"
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            getInitials()
          )}
        </div>

        {/* Dropdown indicator */}
        <ChevronDown aria-hidden="true" className={`w-3 h-3 text-white/80 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          ref={dropdownRef}
          id="user-account-menu"
          className="absolute right-0 mt-2 w-64 max-w-[calc(100vw-1rem)] bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
          role="menu"
          aria-orientation="vertical"
          aria-label="Account"
          onKeyDown={handleMenuKeyDown}
        >
          {/* User info */}
          <div className="px-4 py-2 border-b border-gray-100" role="none">
            <div className="flex items-center gap-3">
              <div aria-hidden="true" className={`w-10 h-10 rounded-full ${getAvatarColor()} flex items-center justify-center text-white text-sm font-medium`}>
                {session.user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- small remote OAuth avatar; next/image would need remotePatterns for every provider
                  <img
                    src={session.user.image}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-full h-full rounded-full object-cover"
                  />
                ) : (
                  getInitials()
                )}
              </div>
              <div className="flex-1 min-w-0">
                {session.user?.name && (
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {session.user.name}
                  </div>
                )}
                <div className="text-xs text-gray-500 truncate">
                  {session.user?.email}
                </div>
              </div>
            </div>
          </div>

          {/* Menu items */}
          <div className="py-1" role="none">
            {/* Settings - for future use */}
            <button
              type="button"
              role="menuitem"
              aria-disabled="true"
              tabIndex={-1}
              className="w-full px-4 py-2 text-left text-sm text-gray-500 flex items-center gap-3 cursor-not-allowed"
              title="Settings coming soon"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
              Settings
              <span className="text-xs text-gray-500 ml-auto">Coming soon</span>
            </button>

            {canAccessAdmin && (
              <Link
                href="/admin"
                role="menuitem"
                tabIndex={-1}
                onClick={() => setIsOpen(false)}
                className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none flex items-center gap-3 transition-colors"
              >
                <Shield className="w-4 h-4" aria-hidden="true" />
                Admin
              </Link>
            )}

            {/* Sign out */}
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: '/' })}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 hover:text-red-600 focus:bg-gray-50 focus:text-red-600 focus:outline-none flex items-center gap-3 transition-colors"
              role="menuitem"
              tabIndex={-1}
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
