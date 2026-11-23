import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '@/components/ui/button';

import { celebrateOffer } from './celebration-store';
import { OfferCelebration } from './offer-celebration';

/**
 * The "offer received" moment. Press the button (again to replay). Toggle reduced motion in
 * the OS or DevTools (Rendering → prefers-reduced-motion) to see the fade-only version.
 */
const meta = {
  title: 'Signature/Offer celebration',
  component: OfferCelebration,
  render: () => (
    <div className="grid min-h-80 place-items-center">
      <Button onClick={() => celebrateOffer('Monzo')}>Receive an offer</Button>
      <OfferCelebration />
    </div>
  ),
} satisfies Meta<typeof OfferCelebration>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
