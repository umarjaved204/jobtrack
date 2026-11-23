/*
 * Browsers flag form fields with neither an id nor a name ("A form field element should
 * have an id or name attribute"): autofill can't tell them apart. Radix Select renders a
 * hidden native <select> inside a <form> that only gets the `name` passed to <Select>.
 */

const FIELDS = 'input, select, textarea';

/** Form fields under `root` with neither an id nor a name: should be none. */
export function unnamedFormFields(root: ParentNode = document) {
  return [...root.querySelectorAll<HTMLElement>(FIELDS)]
    .filter((el) => !el.id && !el.getAttribute('name'))
    .map((el) => el.outerHTML);
}

/** The names of the native selects under `root`, in DOM order (Radix renders one per Select). */
export function selectNames(root: ParentNode = document) {
  return [...root.querySelectorAll('select')].map((el) => el.getAttribute('name'));
}
