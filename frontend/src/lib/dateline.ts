/**
 * The masthead's date line: "Wednesday, 25 November 2026" in the browser's locale. Its own
 * module (not lib/dates): the public pages show it, and lib/dates brings date-fns.
 */
export const dateline = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
