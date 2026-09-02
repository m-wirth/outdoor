export const PLANNER_ROLES = [
  'Event Hauptleiter',
  'Event Leiter',
  'Küche',
  'Teilnehmer',
  'Gast',
  'Expertenpraktikant',
  'Sonstige'
] as const;

export const GENDERS = ['Weiblich', 'Männlich', 'Divers', 'Keine Angabe'] as const;
export const PERIODS = ['morning', 'lunch', 'afternoon', 'dinner', 'overnight'] as const;
export const NUTRITION_PREFERENCES = [
  'Vegetarisch',
  'Vegan',
  'Laktosefrei',
  'Glutenfrei',
  'Nussallergie',
  'Erdnussallergie',
  'Fischallergie',
  'Meeresfrüchteallergie',
  'Ei-Allergie',
  'Soja-Allergie',
  'Sesam-Allergie',
  'Schweinefleischfrei',
  'Halal',
  'Koscher'
] as const;

export type PlannerRole = typeof PLANNER_ROLES[number];
export type Gender = typeof GENDERS[number];
export type Period = typeof PERIODS[number];
export type NutritionPreference = typeof NUTRITION_PREFERENCES[number];
export type MealPeriod = 'lunch' | 'dinner';
export type AbsenceStatus = 'pending' | 'approved' | 'rejected';

export interface SubTraining {
  id: string;
  name: string;
  instructors: string[];
}

export interface PlannerPerson {
  id: string;
  firstName: string;
  lastName: string;
  gender: Gender;
  role: PlannerRole;
  subTrainingId: string | null;
  external: boolean;
  expert: boolean;
  nutritionPreferences: NutritionPreference[];
  medicalInformation: string;
  archived: boolean;
}

export interface DayPresence {
  morning: boolean;
  lunch: boolean;
  afternoon: boolean;
  dinner: boolean;
  overnight: boolean;
  mealOverrides?: Partial<Record<MealPeriod, boolean>>;
}

export interface Absence {
  id: string;
  personId: string;
  departureAt: string;
  returnAt: string;
  reason: string;
  status: AbsenceStatus;
  decision: string;
}

export interface Training {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  mainInstructor: string;
  subTrainings: SubTraining[];
  people: PlannerPerson[];
  presence: Record<string, Record<string, DayPresence>>;
  absences: Absence[];
  createdAt: string;
  updatedAt: string;
}

export interface PlannerState {
  version: 1;
  trainings: Training[];
}

export interface PersonDraft {
  firstName: string;
  lastName: string;
  gender: Gender;
  role: PlannerRole;
  subTrainingId: string | null;
  external: boolean;
  expert: boolean;
  nutritionPreferences: NutritionPreference[];
  medicalInformation: string;
}

export interface ImportRow extends PersonDraft {
  line: number;
  valid: boolean;
  duplicate: boolean;
  errors: string[];
}

export const EMPTY_STATE: PlannerState = { version: 1, trainings: [] };
