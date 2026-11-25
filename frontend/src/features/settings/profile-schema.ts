import { z } from 'zod';

import { fullName } from '@/features/auth/schemas';

export const profileSchema = z.object({ full_name: fullName });
export type ProfileValues = z.infer<typeof profileSchema>;
export const profileFields = ['full_name'] as const;
