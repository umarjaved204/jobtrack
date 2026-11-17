import type { Decorator, Preview } from '@storybook/react-vite';

import '@fontsource-variable/fraunces/full.css';
import '@fontsource-variable/fraunces/full-italic.css';
import '@fontsource-variable/instrument-sans/wdth.css';
import '@fontsource-variable/jetbrains-mono';
import '../src/styles/index.css';

import { accentColors, DEFAULT_ACCENT } from '../src/lib/palette';

/**
 * Applies the toolbar's theme + accent the same way the app does: a `.dark` class and
 * a `data-accent` attribute on <html>. Stories therefore render exactly as in the app.
 */
const withTheme: Decorator = (Story, context) => {
  const root = document.documentElement;
  const theme = context.globals['theme'] === 'dark' ? 'dark' : 'light';
  root.classList.toggle('dark', theme === 'dark');
  root.dataset['accent'] = String(context.globals['accent'] ?? DEFAULT_ACCENT);
  return <Story />;
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Light (Broadsheet) or dark (Night edition)',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Broadsheet (light)', icon: 'sun' },
          { value: 'dark', title: 'Night edition (dark)', icon: 'moon' },
        ],
        dynamicTitle: true,
      },
    },
    accent: {
      description: 'User accent colour',
      toolbar: {
        title: 'Accent',
        icon: 'paintbrush',
        items: accentColors.map((value) => ({ value, title: value })),
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: 'light',
    accent: DEFAULT_ACCENT,
  },
  parameters: {
    layout: 'padded',
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
