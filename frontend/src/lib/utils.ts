import { createCn } from 'cn/config';

/**
 * Class-name join + Tailwind conflict resolution (`cn` replaces clsx + tailwind-merge).
 *
 * Taught our custom theme keys so it can tell, e.g., the font size `text-display` from the
 * colour `text-primary`. Without this it would treat both as colours and drop one.
 * Keep in sync with the `--text-*` and `--ease-*` tokens in src/styles/index.css.
 */
export const cn = createCn({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display-sm', 'display', 'display-lg', 'numeral'] }],
      ease: [{ ease: ['out-quint', 'out-expo', 'in-out-quart'] }],
    },
  },
});
