import { useEffect, useRef } from 'react';
import type { Preferences } from '../settings/store';
export function useGamepadNavigation(
  prefs: Preferences,
  enabled: boolean,
  onMenu: () => void,
  allowStart = true,
) {
  const menu = useRef(onMenu);
  menu.current = onMenu;
  useEffect(() => {
    let raf = 0,
      previous = new Set<number>(),
      lastMove = 0;
    const frame = (now: number) => {
      const pad = navigator.getGamepads?.()[prefs.gamepadIndex];
      if (pad && enabled && !document.querySelector('.listening')) {
        const held = new Set<number>();
        pad.buttons.forEach((b, i) => {
          if (b.pressed) held.add(i);
        });
        if ((pad.axes[1] ?? 0) < -prefs.deadzone) held.add(12);
        if ((pad.axes[1] ?? 0) > prefs.deadzone) held.add(13);
        const root = document.querySelector('.overlay') ?? document.querySelector('main');
        const focusables = Array.from(
          root?.querySelectorAll<HTMLElement>(
            'button:not(:disabled),input:not(:disabled),select:not(:disabled),summary',
          ) ?? [],
        ).filter((el) => el.getClientRects().length > 0);
        const direction = held.has(13) ? 1 : held.has(12) ? -1 : 0;
        if (direction && (!previous.has(direction > 0 ? 13 : 12) || now - lastMove > 220)) {
          const index = focusables.indexOf(document.activeElement as HTMLElement);
          focusables[(index + direction + focusables.length) % focusables.length]?.focus();
          lastMove = now;
        }
        const active = document.activeElement;
        if (held.has(0) && !previous.has(0)) {
          if (
            active instanceof HTMLButtonElement ||
            (active instanceof HTMLInputElement && active.type === 'checkbox') ||
            (active instanceof HTMLElement && active.tagName === 'SUMMARY')
          )
            active.click();
          else focusables[0]?.focus();
        }
        const horizontal = held.has(15) && !previous.has(15) ? 1 : held.has(14) && !previous.has(14) ? -1 : 0;
        if (horizontal && active instanceof HTMLSelectElement) {
          active.selectedIndex = Math.max(
            0,
            Math.min(active.options.length - 1, active.selectedIndex + horizontal),
          );
          active.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if ((held.has(1) && !previous.has(1)) || (allowStart && held.has(9) && !previous.has(9)))
          menu.current();
        previous = held;
      } else previous = new Set();
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [prefs.gamepadIndex, prefs.deadzone, enabled, allowStart]);
}
