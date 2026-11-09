/**
 * ECS component catalog (shared with the IWSDK editor).
 */
import { createComponent, defineComponents, Types } from '@iwsdk/core';

/** Marks a currency orb entity; slotIndex points into config SLOTS. */
export const Orb = createComponent('Orb', {
  slotIndex: { type: Types.Int8, default: 0 },
});

/** Marks the Historical Portal window (pinch it for a short explanation). */
export const PortalTarget = createComponent('PortalTarget', {});

export default defineComponents([Orb, PortalTarget]);
