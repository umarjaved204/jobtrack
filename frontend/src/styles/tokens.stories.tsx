import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

import { duration } from '../lib/motion';
import { paletteColors } from '../lib/palette';

/**
 * Living reference for the design tokens in `tokens.css` / `index.css`.
 * Flip the Theme and Accent toolbar controls to see every value change.
 */
const meta = {
  title: 'Foundations/Tokens',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

function Section({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mx-auto max-w-page px-8 py-10">
      <div className="pt-3 rule-double">
        <p className="kicker text-muted-foreground">{kicker}</p>
        <h2 className="mt-2 display-face text-display-sm">{title}</h2>
      </div>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Swatch({ token, label }: { token: string; label?: string }) {
  return (
    <figure className="flex items-center gap-3">
      <span
        className="size-12 shrink-0 rounded-md border shadow-xs"
        style={{ background: `var(--${token})` }}
      />
      <figcaption>
        <p className="text-sm font-semibold">{label ?? token}</p>
        <p className="figures text-xs text-muted-foreground">--{token}</p>
      </figcaption>
    </figure>
  );
}

const semantic = [
  'background',
  'foreground',
  'card',
  'muted',
  'muted-foreground',
  'accent',
  'primary',
  'primary-text',
  'primary-tint',
  'brand',
  'highlight',
  'destructive',
  'border',
  'input',
  'rule',
  'ring',
];

export const Colour: Story = {
  render: () => (
    <Section kicker="Foundations" title="Colour">
      <h3 className="kicker text-muted-foreground">Semantic roles</h3>
      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-5">
        {semantic.map((t) => (
          <Swatch key={t} token={t} />
        ))}
      </div>

      <h3 className="mt-12 kicker text-muted-foreground">
        Named palette (accents and tag colours)
      </h3>
      <div className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-5">
        {paletteColors.map((name) => (
          <div
            key={name}
            className="rounded-md p-4"
            style={{ background: `var(--palette-${name}-tint)` }}
          >
            <p className="font-semibold capitalize" style={{ color: `var(--palette-${name})` }}>
              {name}
            </p>
            <p
              className="mt-3 inline-block rounded-sm px-2 py-0.5 text-sm font-medium"
              style={{
                background: `var(--palette-${name})`,
                color: 'var(--palette-on)',
              }}
            >
              Solid fill
            </p>
          </div>
        ))}
      </div>
    </Section>
  ),
};

const statuses = [
  'wishlist',
  'applied',
  'screening',
  'interview',
  'offer',
  'rejected',
  'withdrawn',
] as const;

export const StatusRamp: Story = {
  name: 'Status ramp',
  render: () => (
    <Section kicker="Foundations" title="Application status">
      <ol className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-px overflow-hidden rounded-md border bg-border">
        {statuses.map((s, i) => (
          <li
            key={s}
            className="p-4"
            style={{ background: `var(--status-${s}-tint)`, color: `var(--status-${s})` }}
          >
            <p className="figures text-xs">{String(i + 1).padStart(2, '0')}</p>
            <p className="mt-6 font-display text-xl font-semibold capitalize">{s}</p>
          </li>
        ))}
      </ol>
    </Section>
  ),
};

const textSizes = [
  ['text-numeral', 'font-mono', '128'],
  ['text-display-lg', 'display-face', 'Offer received'],
  ['text-display', 'display-face', 'The week in applications'],
  ['text-display-sm', 'font-display', 'Pipeline overview'],
  ['text-xl', 'font-sans', 'Senior Frontend Engineer at Monzo'],
  ['text-base', 'font-sans', 'Recruiter screen moved to Thursday, 14:30 GMT.'],
  ['text-sm', 'font-sans', 'Applied via LinkedIn · Hybrid · London'],
  ['text-xs', 'font-mono', '2026-11-17 · £65,000–£80,000'],
] as const;

export const Typography: Story = {
  render: () => (
    <Section kicker="Foundations" title="Type">
      <dl className="divide-y">
        {textSizes.map(([size, face, sample]) => (
          <div key={size} className="grid gap-2 py-5 md:grid-cols-[12rem_1fr] md:items-baseline">
            <dt className="figures text-xs text-muted-foreground">
              {size}
              <br />
              {face}
            </dt>
            <dd className={`${size} ${face} ${face === 'font-mono' ? 'figures' : ''}`}>{sample}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-8 kicker text-primary-text">Kicker · Section label</p>
    </Section>
  ),
};

export const Elevation: Story = {
  render: () => (
    <Section kicker="Foundations" title="Elevation, shape and motion">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-6">
        {['shadow-xs', 'shadow-sm', 'shadow-md', 'shadow-lg'].map((s) => (
          <div key={s} className={`rounded-lg bg-card p-5 ${s}`}>
            <p className="figures text-xs">{s}</p>
          </div>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-6">
        {['rounded-xs', 'rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl'].map(
          (r) => (
            <div key={r} className="text-center">
              <div className={`size-16 border-2 border-rule bg-primary-tint ${r}`} />
              <p className="mt-2 figures text-xs text-muted-foreground">{r}</p>
            </div>
          ),
        )}
      </div>
      <dl className="mt-10 grid max-w-md grid-cols-2 gap-y-1 figures text-sm">
        {Object.entries(duration).map(([name, s]) => (
          <div key={name} className="contents">
            <dt className="text-muted-foreground">--duration-{name}</dt>
            <dd>{Math.round(s * 1000)}ms</dd>
          </div>
        ))}
      </dl>
    </Section>
  ),
};
