# Output list micro-adjustments

User directly requested a more suitable toggle icon, no list dismissal on outside clicks, and title “输出”.

Implemented: closed PanelTopOpen / open PanelTopClose; scoped output labels; Popover modal=false and onOpenChange cancellation only for outside-press/focus-out. Native click/focus events remain untouched, trigger/Escape/explicit preview behavior retained. Backend, CSS and project Files navigation unchanged.

Checks: web typecheck,90 focused artifact/routed tests and production build passed. Independent review verified reason values and cancellation behavior against installed Base UI1.8 source, no findings/edits. Real Chromium production fixture (`/tmp/kiva-artifacts-output-browser.py`) passed desktop+390dark: correct heading/icons, outside message click and composer click/focus/typing keep Popover open, repeat trigger retracts, default modal and focus fallback work, Escape closes, no page errors. Prior full452 regression baseline remains; only relevant suites rerun for this local UI delta.

Only fixture9498 stopped, original next-env+two playground HTML files preserved byte-for-byte. No commit/merge/push/archive.
