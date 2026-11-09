/**
 * ECS component catalog (shared with the IWSDK editor).
 */
import { createComponent, defineComponents, Types } from '@iwsdk/core';

/** Marks a currency's pinch target (map marker or chart label); slotIndex points into config SLOTS. */
export const Orb = createComponent('Orb', {
  slotIndex: { type: Types.Int8, default: 0 },
});

/** Marks the Historical Events band's portal (pinch it for people, policies and sources). */
export const PortalTarget = createComponent('PortalTarget', {});

export default defineComponents([Orb, PortalTarget]);
