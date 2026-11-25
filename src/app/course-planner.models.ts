import type { PlannerState, Training } from './planner.models';

export type LocalDate = string;
export type LocalTime = string;
export type LessonCategory = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I' | 'J' | 'K' | 'L' | 'M' | 'N' | 'O' | 'P';
export type JsFrameworkId = 'js-leitendenkurs-lst' | 'js-leitendenkurs-paedagogik-lst' | 'js-modul-lager-hauptleiten-lst';
export type GoalReference = { type: 'js'; frameworkId: JsFrameworkId; goalId: string } | { type: 'custom'; goalId: string };

export interface TrainingEvent {
  id: string;
  name: string;
  startDate: LocalDate;
  endDate: LocalDate;
  mainInstructor?: string;
  source?: {
    type: 'personal-planner';
    version: number;
    trainingId: string;
    importedAt: string;
    sourceUpdatedAt?: string;
    independentCopy?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

export interface Course {
  id: string;
  trainingEventId: string;
  name: string;
  startDate: LocalDate;
  endDate: LocalDate;
  location: string;
  frameworkId?: JsFrameworkId;
  sourceSubTrainingId?: string;
  importedInstructors?: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface LessonStep {
  id: string;
  arivaPhase?: 'A' | 'R' | 'I' | 'V' | 'A2' | 'OTHER';
  title: string;
  description: string;
  durationMinutes: number;
  order: number;
}

export interface Lesson {
  id: string;
  category: LessonCategory;
  number: string;
  title: string;
  summary: string;
  durationMinutes: number;
  goals: GoalReference[];
  participantDocuments: string;
  instructorDocuments: string;
  teachingReferences: string;
  material: string;
  steps: LessonStep[];
  createdAt: string;
  updatedAt: string;
}

export interface LessonPlacement {
  id: string;
  lessonId: string;
  courseId: string;
  date: LocalDate;
  startTime: LocalTime;
  location: string;
  laneOrder?: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomGoalCategory {
  id: string;
  name: string;
  shortName?: string;
  color: string;
  order: number;
}

export interface CustomGoal {
  id: string;
  categoryId: string;
  code?: string;
  text: string;
  note?: string;
  order: number;
}

export interface CoursePlannerSettings {
  dayStartHour: number;
  dayEndHour: number;
  activeTrainingEventId?: string;
}

export interface CoursePlannerState {
  schemaVersion: 1;
  trainingEvents: TrainingEvent[];
  courses: Course[];
  lessons: Lesson[];
  placements: LessonPlacement[];
  customGoalCategories: CustomGoalCategory[];
  customGoals: CustomGoal[];
  settings: CoursePlannerSettings;
  updatedAt: string;
}

export interface JsGoal {
  id: string;
  code: string;
  area: string;
  topic: string;
  text: string;
}

export interface JsFramework {
  id: JsFrameworkId;
  name: string;
  shortName: string;
  goals: JsGoal[];
}

export type PersonalPlannerTraining = Pick<Training, 'id' | 'name' | 'startDate' | 'endDate'>
  & Partial<Pick<Training, 'mainInstructor' | 'subTrainings' | 'updatedAt'>>;

export interface PersonalPlannerFile {
  version: PlannerState['version'];
  trainings: PersonalPlannerTraining[];
}

export const EMPTY_COURSE_PLANNER_STATE: CoursePlannerState = {
  schemaVersion: 1,
  trainingEvents: [],
  courses: [],
  lessons: [],
  placements: [],
  customGoalCategories: [],
  customGoals: [],
  settings: { dayStartHour: 6, dayEndHour: 22 },
  updatedAt: new Date(0).toISOString()
};

export const LESSON_CATEGORIES: LessonCategory[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P'];

