/**
 * First focusable element on every layout: lets keyboard users jump past the masthead.
 * Visually hidden until focused. Targets the layout's `<main id="main">`.
 */
function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only z-50 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      Skip to content
    </a>
  );
}

export { SkipLink };
