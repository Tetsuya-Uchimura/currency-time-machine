/**
 * ECS component catalog (shared with the IWSDK editor).
 */
import { createComponent, defineComponents, Types } from '@iwsdk/core';

/** Marks a currency orb entity; slotIndex points into config SLOTS. */
export const Orb = createComponent('Orb', {
  slotIndex: { type: Types.Int8, default: 0 },
});

export default defineComponents([Orb]);
