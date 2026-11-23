import { AnimatePresence, m } from 'motion/react';
import { useEffect, useMemo } from 'react';

import { LiveRegion } from '@/components/live-region';
import { useMediaQuery } from '@/hooks/use-media-query';
import { duration, ease } from '@/lib/motion';

import { CELEBRATION_MS, dismissCelebration, useCelebration } from './celebration-store';
import { type ConfettiPiece, makeConfetti } from './confetti';

/** The slam: accelerate into the page, squash a little, settle. Seconds. */
const SLAM = 0.34;
const slamIn = [0.55, 0, 1, 0.45] as const;

function ConfettiScrap({ piece }: { piece: ConfettiPiece }) {
  const delay = SLAM * 0.6 + piece.delay; // thrown out as the stamp lands
  const timing = { duration: piece.duration, delay };
  return (
    <m.span
      className="absolute top-1/2 left-1/2 block rounded-[1px]"
      style={{
        width: piece.width,
        height: piece.height,
        marginLeft: -piece.width / 2,
        marginTop: -piece.height / 2,
        background: `var(--${piece.color})`,
        // Paper on paper needs an edge to be seen.
        boxShadow:
          piece.color === 'paper'
            ? 'inset 0 0 0 1px color-mix(in oklab, var(--ink) 30%, transparent)'
            : undefined,
      }}
      initial={{ x: 0, y: 0, rotate: 0, opacity: 0 }}
      animate={{
        x: piece.x,
        y: [0, piece.peak, piece.fall],
        rotate: piece.spin,
        opacity: [0, 1, 1, 0],
      }}
      transition={{
        x: { ...timing, ease: ease.outQuint },
        // Up fast, then gravity.
        y: { ...timing, times: [0, 0.3, 1], ease: ['easeOut', 'easeIn'] },
        rotate: { ...timing, ease: 'linear' },
        opacity: { ...timing, times: [0, 0.04, 0.75, 1] },
      }}
    />
  );
}

function Stamp({ company, reduceMotion }: { company: string; reduceMotion: boolean }) {
  return (
    <m.div
      data-slot="offer-stamp"
      initial={reduceMotion ? { opacity: 0, rotate: -8 } : { opacity: 0, scale: 2.4, rotate: -18 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: [2.4, 0.93, 1], rotate: -8 }}
      transition={
        reduceMotion
          ? { duration: duration.base }
          : {
              duration: SLAM,
              opacity: { duration: SLAM * 0.4 },
              scale: { duration: SLAM, times: [0, 0.62, 1], ease: [slamIn, ease.outQuint] },
              rotate: { duration: SLAM * 0.62, ease: slamIn },
            }
      }
      className="relative"
    >
      <div
        // Rubber-stamp edges: the ink filter below roughens the outline and the type.
        style={{ filter: 'url(#offer-stamp-ink)' }}
        className="rounded-lg border-[6px] border-double border-brand bg-paper/85 px-10 py-4 text-center shadow-lg"
      >
        <p className="font-display text-[clamp(3.5rem,14vw,7rem)] leading-none font-black tracking-[0.06em] text-brand uppercase">
          Offer
        </p>
        <p className="mt-2 border-t-2 border-brand pt-2 text-sm font-bold tracking-[0.18em] text-primary-text uppercase">
          Received · {company}
        </p>
      </div>
    </m.div>
  );
}

function Burst({ company, reduceMotion }: { company: string; reduceMotion: boolean }) {
  // Decided once per celebration: re-renders don't reshuffle the scraps mid-flight.
  const pieces = useMemo(() => (reduceMotion ? [] : makeConfetti()), [reduceMotion]);
  return (
    <m.div
      aria-hidden="true"
      data-slot="offer-celebration"
      className="pointer-events-none fixed inset-0 z-[60] grid place-items-center overflow-hidden"
      exit={{ opacity: 0, transition: { duration: duration.slow } }}
    >
      <svg width="0" height="0" className="absolute">
        <filter id="offer-stamp-ink">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="3" />
        </filter>
      </svg>
      <div className="relative">
        {pieces.map((piece, i) => (
          <ConfettiScrap key={i} piece={piece} />
        ))}
        <Stamp company={company} reduceMotion={reduceMotion} />
      </div>
    </m.div>
  );
}

/**
 * "Offer received": an ink stamp slams onto the page and paper confetti bursts from
 * behind it. Raised by `celebrateOffer` (the mutations call it); mounted once, in the app
 * shell. Decorative and click-through: screen readers get the live-region sentence
 * instead. Reduced motion: the stamp fades in, no slam and no confetti. It leaves by
 * itself, or on Escape.
 */
function OfferCelebration() {
  const celebration = useCelebration();
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const id = celebration?.id;

  useEffect(() => {
    if (id === undefined) return;
    const timer = setTimeout(() => dismissCelebration(id), CELEBRATION_MS);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismissCelebration(id);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [id]);

  return (
    <>
      <LiveRegion
        message={
          celebration && {
            id: celebration.id,
            text: `Offer received from ${celebration.company}. Congratulations!`,
          }
        }
      />
      <AnimatePresence>
        {celebration && (
          <Burst key={celebration.id} company={celebration.company} reduceMotion={reduceMotion} />
        )}
      </AnimatePresence>
    </>
  );
}

export { OfferCelebration };
