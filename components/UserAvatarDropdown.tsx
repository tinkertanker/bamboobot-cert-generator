import React, { useState, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { User, LogOut, Settings, ChevronDown } from 'lucide-react';
import { useClickOutside } from '@/hooks/useClickOutside';

export function UserAvatarDropdown() {
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close dropdown when clicking outside
  useClickOutside([dropdownRef, buttonRef], () => setIsOpen(false), isOpen);

  if (!session?.user) return null;

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
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {/* Avatar */}
        <div className={`w-8 h-8 rounded-full ${getAvatarColor()} flex items-center justify-center text-white text-sm font-medium`}>
          {session.user?.image ? (
            <img
              src={session.user.image}
              alt={session.user.name || 'User avatar'}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            getInitials()
          )}
        </div>

        {/* Dropdown indicator */}
        <ChevronDown className={`w-3 h-3 text-white/80 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50"
          role="menu"
          aria-orientation="vertical"
        >
          {/* User info */}
          <div className="px-4 py-2 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full ${getAvatarColor()} flex items-center justify-center text-white text-sm font-medium`}>
                {session.user?.image ? (
                  <img
                    src={session.user.image}
                    alt={session.user.name || 'User avatar'}
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
          <div className="py-1">
            {/* Settings - for future use */}
            <button
              className="w-full px-4 py-2 text-left text-sm text-gray-400 hover:bg-gray-50 flex items-center gap-3 cursor-not-allowed"
              disabled
              title="Settings coming soon"
            >
              <Settings className="w-4 h-4" />
              Settings
              <span className="text-xs text-gray-400 ml-auto">Coming soon</span>
            </button>

            {/* Sign out */}
            <button
              onClick={() => signOut()}
              className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 hover:text-red-600 flex items-center gap-3 transition-colors"
              role="menuitem"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}