export type CardRatio = "story" | "post";
export type CardTone = "dark" | "light";

/** Size of every Share Card, whichever kind (see ShareCards.tsx): 9:16 story or 4:5 post at 360 px wide. */
export const CARD_WIDTH = 360;
export const CARD_HEIGHT: Record<CardRatio, number> = { story: 640, post: 450 };
