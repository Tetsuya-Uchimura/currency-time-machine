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

/** A Year Journey button (year selector, summary); `action` is a UiAction (src/visual/ui-button.ts). */
export const UiTarget = createComponent('UiTarget', {
  action: { type: Types.Int16, default: 0 },
});

/** The hand panel's grip: pinch it and move the hand to move the panel. */
export const GripTarget = createComponent('GripTarget', {});

/** A touch zone of Tock, the guide robot: 0 head, 1 body, 2 hand. */
export const TockTarget = createComponent('TockTarget', {
  zone: { type: Types.Int8, default: 0 },
});

export default defineComponents([Orb, PortalTarget, UiTarget, GripTarget, TockTarget]);
