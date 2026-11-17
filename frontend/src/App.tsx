// Token specimen: a quick visual check of the design system until the app shell
// (routing + layout) replaces it later in Phase 4. Storybook hosts the full reference.
const statuses = [
  'wishlist',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const;

const statusClass: Record<(typeof statuses)[number], string> = {
  wishlist: 'bg-status-wishlist-tint text-status-wishlist',
  applied: 'bg-status-applied-tint text-status-applied',
  screening: 'bg-status-screening-tint text-status-screening',
  interview: 'bg-status-interview-tint text-status-interview',
  offer: 'bg-status-offer-tint text-status-offer',
  rejected: 'bg-status-rejected-tint text-status-rejected',
  withdrawn: 'bg-status-withdrawn-tint text-status-withdrawn',
};

export default function App() {
  return (
    <main className="mx-auto max-w-page px-6 py-12">
      <header className="pt-3 rule-double">
        <p className="kicker text-muted-foreground">Vol. 1 · The job hunt, in print</p>
        <h1 className="mt-4 display-face text-display-lg">
          Job<span className="text-brand">Track</span>
        </h1>
      </header>

      <section className="mt-10 grid gap-8 pt-6 rule-hairline md:grid-cols-3">
        <div>
          <p className="kicker text-muted-foreground">Applications</p>
          <p className="mt-2 figures text-numeral">128</p>
        </div>
        <div>
          <p className="kicker text-muted-foreground">Interview rate</p>
          <p className="mt-2 figures text-numeral text-primary-text">23%</p>
        </div>
        <div className="rounded-md bg-card p-6 shadow-md">
          <h2 className="text-display-sm">Pipeline</h2>
          <ul className="mt-4 flex flex-wrap gap-2">
            {statuses.map((s) => (
              <li
                key={s}
                className={`rounded-sm px-2 py-0.5 text-sm font-medium capitalize ${statusClass[s]}`}
              >
                {s}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm"
          >
            Add application
          </button>
        </div>
      </section>
    </main>
  );
}
