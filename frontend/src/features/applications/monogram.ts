/** "Octopus Energy" → "OE"; a single word gives its first two letters ("Monzo" → "MO"). */
export function monogram(company: string): string {
  const words = company.trim().split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}` : company.trim().slice(0, 2);
  return letters.toUpperCase();
}
