export const raceValues = [0, 1, 2] as const;
export const classValues = [0, 1, 2] as const;
export const difficultyValues = [0, 1, 2, 3, 4] as const;
export const varianceModeValues = [0, 1, 2] as const;
export const potionChoiceValues = [0, 1, 2, 3] as const;
export const abilityChoiceValues = [0, 1, 2, 3] as const;

export type Race = (typeof raceValues)[number];
export type ClassType = (typeof classValues)[number];
export type Difficulty = (typeof difficultyValues)[number];
export type VarianceMode = (typeof varianceModeValues)[number];
export type PotionChoice = (typeof potionChoiceValues)[number];
export type AbilityChoice = (typeof abilityChoiceValues)[number];
