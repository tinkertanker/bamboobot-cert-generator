import React, { useEffect, useRef, useState } from "react";
import { StorageMonitor } from "@/components/StorageMonitor";
import { LocalStorageMonitor } from "@/components/LocalStorageMonitor";
import { ChevronUp, Minimize2, Wrench } from "lucide-react";

interface DevModeFooterProps {
  isDevelopment: boolean;
  isSuperAdmin?: boolean;
  devMode: boolean;
  handleDevModeToggle: () => void;
  baseEmail: string;
  setBaseEmail: (value: string) => void;
  numTestEmails: number;
  setNumTestEmails: (value: number) => void;
  handleEmailTemplateUpdate: () => void;
}

export function DevModeFooter({
  isDevelopment,
  isSuperAdmin = false,
  devMode,
  handleDevModeToggle,
  baseEmail,
  setBaseEmail,
  numTestEmails,
  setNumTestEmails,
  handleEmailTemplateUpdate
}: DevModeFooterProps) {
  const [isMinimized, setIsMinimized] = useState(true); // Default to minimised
  // Height of the expanded bar, mirrored by an in-flow spacer so the fixed bar
  // never hides the bottom of the page content.
  const [barHeight, setBarHeight] = useState(0);
  const barRef = useRef<HTMLDivElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const minimiseButtonRef = useRef<HTMLButtonElement>(null);
  // Only move focus after the user toggles the panel, not on first render.
  const userToggledRef = useRef(false);
  const MIN_TEST_EMAILS = 1;
  const MAX_TEST_EMAILS = 100;
  const DEFAULT_TEST_EMAILS = 10;

  useEffect(() => {
    if (isMinimized) {
      setBarHeight(0);
    } else {
      const el = barRef.current;
      if (el) {
        const update = () => setBarHeight(el.offsetHeight);
        update();
        if (typeof ResizeObserver !== "undefined") {
          const observer = new ResizeObserver(update);
          observer.observe(el);
          return () => observer.disconnect();
        }
      }
    }
    return undefined;
  }, [isMinimized]);

  useEffect(() => {
    if (!userToggledRef.current) return;
    (isMinimized ? expandButtonRef : minimiseButtonRef).current?.focus();
  }, [isMinimized]);

  const toggleMinimised = (value: boolean) => {
    userToggledRef.current = true;
    setIsMinimized(value);
  };

  // Show for development mode OR super admins in production
  if (!isDevelopment && !isSuperAdmin) return null;

  // Minimized state - shows in bottom right corner
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <button
          ref={expandButtonRef}
          type="button"
          onClick={() => toggleMinimised(false)}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-900 text-white rounded-lg shadow-lg hover:bg-gray-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2"
          title="Open developer tools"
          aria-label="Open developer tools"
          aria-expanded={false}
        >
          <ChevronUp className="w-4 h-4" aria-hidden="true" />
          <Wrench className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  // Full footer bar
  return (
    <>
    {/* Spacer keeps page content scrollable above the fixed bar */}
    <div aria-hidden="true" style={{ height: barHeight }} />
    <div
      ref={barRef}
      role="region"
      aria-label="Developer tools"
      className="fixed bottom-0 left-0 right-0 z-40 bg-gray-900 border-t border-gray-700 shadow-2xl"
    >
      <div className="flex items-center justify-end gap-2 px-2 sm:px-4 py-2">
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-4 min-w-0">
          {/* Dev Mode Toggle */}
          <div className="flex items-center gap-2 px-3 py-1 bg-gray-800 rounded-lg">
            <input
              type="checkbox"
              id="dev-mode-footer-toggle"
              checked={devMode}
              onChange={handleDevModeToggle}
              className="w-4 h-4"
            />
            <label
              htmlFor="dev-mode-footer-toggle"
              className="text-sm font-medium text-gray-100">
              Dev Mode
            </label>
          </div>

          {/* Storage Monitors - Always visible in development */}
          <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
            <StorageMonitor />
            <LocalStorageMonitor />
          </div>

          {/* Email Template Controls - Only when dev mode is on */}
          {devMode && (
            <div className="flex flex-wrap items-center gap-2 px-3 py-1 bg-blue-900/30 rounded-lg border border-blue-700">
              <input
                type="email"
                placeholder="test@gmail.com"
                aria-label="Base email for testing"
                value={baseEmail}
                onChange={(e) => setBaseEmail(e.target.value)}
                className="w-40 px-2 py-1 text-xs bg-gray-800 text-gray-100 border border-gray-600 rounded placeholder-gray-500"
              />
              <input
                type="number"
                min={MIN_TEST_EMAILS}
                max={MAX_TEST_EMAILS}
                value={numTestEmails}
                aria-label="Number of test emails"
                onChange={(e) => {
                  const n = Number(e.target.value);
                  const clamped = Number.isFinite(n)
                    ? Math.min(MAX_TEST_EMAILS, Math.max(MIN_TEST_EMAILS, Math.floor(n)))
                    : DEFAULT_TEST_EMAILS;
                  setNumTestEmails(clamped);
                }}
                className="w-12 px-1 py-1 text-xs bg-gray-800 text-gray-100 border border-gray-600 rounded text-center"
              />
              <button
                type="button"
                onClick={handleEmailTemplateUpdate}
                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600"
                title="Replace the data with test rows using plus-addressed variants of this email"
                disabled={!baseEmail || !baseEmail.includes("@")}>
                Generate
              </button>
            </div>
          )}
        </div>

        {/* Minimize button */}
        <button
          ref={minimiseButtonRef}
          type="button"
          onClick={() => toggleMinimised(true)}
          className="shrink-0 p-1 hover:bg-gray-800 rounded transition-colors sm:ml-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          title="Minimise developer tools"
          aria-label="Minimise developer tools"
          aria-expanded={true}
        >
          <Minimize2 className="w-4 h-4 text-gray-300" aria-hidden="true" />
        </button>
      </div>
    </div>
    </>
  );
}
