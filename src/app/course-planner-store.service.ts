import { Injectable, signal } from '@angular/core';
import {
  Course,
  CoursePlannerState,
  CustomGoal,
  CustomGoalCategory,
  EMPTY_COURSE_PLANNER_STATE,
  Lesson,
  LessonPlacement,
  PersonalPlannerFile,
  TrainingEvent
} from './course-planner.models';
import {
  importPersonalPlanner,
  ImportResult,
  mergeCoursePlannerStates,
  normalizeCoursePlannerState,
  uid
} from './course-planner.utils';

export const COURSE_PLANNER_STORAGE_KEY = 'trailbox.course-program.v1';

@Injectable({ providedIn: 'root' })
export class CoursePlannerStore {
  readonly state = signal<CoursePlannerState>(structuredClone(EMPTY_COURSE_PLANNER_STATE));
  readonly saving = signal(false);
  readonly storageError = signal('');
  readonly lastSavedAt = signal('');

  constructor() {
    this.load();
  }

  createTrainingEvent(input: Pick<TrainingEvent, 'name' | 'startDate' | 'endDate' | 'mainInstructor'>): TrainingEvent {
    const now = new Date().toISOString();
    const event: TrainingEvent = { ...input, id: uid('event'), createdAt: now, updatedAt: now };
    this.change((state) => {
      state.trainingEvents.push(event);
      state.settings.activeTrainingEventId = event.id;
    });
    return event;
  }

  updateTrainingEvent(eventId: string, patch: Partial<Pick<TrainingEvent, 'name' | 'startDate' | 'endDate' | 'mainInstructor'>>): void {
    this.change((state) => {
      const event = state.trainingEvents.find((item) => item.id === eventId);
      if (event) Object.assign(event, patch, { updatedAt: new Date().toISOString() });
    });
  }

  deleteTrainingEvent(eventId: string): void {
    this.change((state) => {
      const courseIds = new Set(state.courses.filter((item) => item.trainingEventId === eventId).map((item) => item.id));
      state.trainingEvents = state.trainingEvents.filter((item) => item.id !== eventId);
      state.courses = state.courses.filter((item) => !courseIds.has(item.id));
      state.placements = state.placements.filter((item) => !courseIds.has(item.courseId));
      if (state.settings.activeTrainingEventId === eventId) state.settings.activeTrainingEventId = state.trainingEvents[0]?.id;
    });
  }

  createCourse(input: Pick<Course, 'trainingEventId' | 'name' | 'startDate' | 'endDate' | 'location' | 'frameworkId'>): Course {
    const now = new Date().toISOString();
    const course: Course = { ...input, id: uid('course'), createdAt: now, updatedAt: now };
    this.change((state) => state.courses.push(course));
    return course;
  }

  updateCourse(courseId: string, patch: Partial<Pick<Course, 'name' | 'startDate' | 'endDate' | 'location' | 'frameworkId'>>): void {
    this.change((state) => {
      const course = state.courses.find((item) => item.id === courseId);
      if (course) Object.assign(course, patch, { updatedAt: new Date().toISOString() });
    });
  }

  deleteCourse(courseId: string): void {
    this.change((state) => {
      state.courses = state.courses.filter((item) => item.id !== courseId);
      state.placements = state.placements.filter((item) => item.courseId !== courseId);
    });
  }

  saveLesson(draft: Omit<Lesson, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Lesson {
    const now = new Date().toISOString();
    let result!: Lesson;
    this.change((state) => {
      const existing = draft.id ? state.lessons.find((item) => item.id === draft.id) : undefined;
      if (existing) {
        result = { ...existing, ...draft, id: existing.id, createdAt: existing.createdAt, updatedAt: now };
        state.lessons = state.lessons.map((item) => item.id === existing.id ? result : item);
      } else {
        result = { ...draft, id: uid('lesson'), createdAt: now, updatedAt: now };
        state.lessons.push(result);
      }
    });
    return result;
  }

  duplicateLesson(lessonId: string, placementId?: string): { lesson: Lesson; placement?: LessonPlacement } {
    const source = this.state().lessons.find((item) => item.id === lessonId);
    if (!source) throw new Error('Lektion nicht gefunden.');
    const now = new Date().toISOString();
    const lesson: Lesson = { ...structuredClone(source), id: uid('lesson'), title: `Kopie von ${source.title}`, createdAt: now, updatedAt: now };
    let placement: LessonPlacement | undefined;
    this.change((state) => {
      state.lessons.push(lesson);
      const sourcePlacement = placementId ? state.placements.find((item) => item.id === placementId) : undefined;
      if (sourcePlacement) {
        placement = { ...sourcePlacement, id: uid('placement'), lessonId: lesson.id, createdAt: now, updatedAt: now };
        state.placements.push(placement);
      }
    });
    return { lesson, placement };
  }

  deleteLesson(lessonId: string): void {
    this.change((state) => {
      state.lessons = state.lessons.filter((item) => item.id !== lessonId);
      state.placements = state.placements.filter((item) => item.lessonId !== lessonId);
    });
  }

  createPlacement(input: Pick<LessonPlacement, 'lessonId' | 'courseId' | 'date' | 'startTime' | 'location'>): LessonPlacement {
    const now = new Date().toISOString();
    const placement: LessonPlacement = { ...input, id: uid('placement'), createdAt: now, updatedAt: now };
    this.change((state) => state.placements.push(placement));
    return placement;
  }

  updatePlacement(placementId: string, patch: Partial<Pick<LessonPlacement, 'courseId' | 'date' | 'startTime' | 'location' | 'laneOrder'>>): void {
    this.change((state) => {
      const placement = state.placements.find((item) => item.id === placementId);
      if (placement) Object.assign(placement, patch, { updatedAt: new Date().toISOString() });
    });
  }

  removePlacement(placementId: string): void {
    this.change((state) => state.placements = state.placements.filter((item) => item.id !== placementId));
  }

  saveGoalCategory(draft: Pick<CustomGoalCategory, 'name' | 'shortName' | 'color'> & { id?: string }): CustomGoalCategory {
    let result!: CustomGoalCategory;
    this.change((state) => {
      const existing = draft.id ? state.customGoalCategories.find((item) => item.id === draft.id) : undefined;
      if (existing) {
        Object.assign(existing, draft);
        result = existing;
      } else {
        result = { ...draft, id: uid('goal-category'), order: state.customGoalCategories.length };
        state.customGoalCategories.push(result);
      }
    });
    return result;
  }

  deleteGoalCategory(categoryId: string): void {
    this.change((state) => {
      const goalIds = new Set(state.customGoals.filter((item) => item.categoryId === categoryId).map((item) => item.id));
      state.customGoalCategories = state.customGoalCategories.filter((item) => item.id !== categoryId);
      state.customGoals = state.customGoals.filter((item) => !goalIds.has(item.id));
      state.lessons = state.lessons.map((lesson) => ({
        ...lesson,
        goals: lesson.goals.filter((goal) => goal.type !== 'custom' || !goalIds.has(goal.goalId))
      }));
    });
  }

  saveCustomGoal(draft: Pick<CustomGoal, 'categoryId' | 'code' | 'text' | 'note'> & { id?: string }): CustomGoal {
    let result!: CustomGoal;
    this.change((state) => {
      const existing = draft.id ? state.customGoals.find((item) => item.id === draft.id) : undefined;
      if (existing) {
        Object.assign(existing, draft);
        result = existing;
      } else {
        result = { ...draft, id: uid('goal'), order: state.customGoals.filter((item) => item.categoryId === draft.categoryId).length };
        state.customGoals.push(result);
      }
    });
    return result;
  }

  deleteCustomGoal(goalId: string): void {
    this.change((state) => {
      state.customGoals = state.customGoals.filter((item) => item.id !== goalId);
      state.lessons = state.lessons.map((lesson) => ({
        ...lesson,
        goals: lesson.goals.filter((goal) => goal.type !== 'custom' || goal.goalId !== goalId)
      }));
    });
  }

  setActiveTrainingEvent(eventId: string): void {
    this.change((state) => state.settings.activeTrainingEventId = eventId);
  }

  importPersonalPlanner(file: PersonalPlannerFile, selectedIds: string[], asCopy = false): ImportResult {
    const result = importPersonalPlanner(this.state(), file, selectedIds, asCopy);
    this.replace(result.state);
    if (!this.state().settings.activeTrainingEventId && this.state().trainingEvents[0]) {
      this.setActiveTrainingEvent(this.state().trainingEvents[0].id);
    }
    return result;
  }

  restore(input: unknown, mode: 'replace' | 'merge'): void {
    const incoming = normalizeCoursePlannerState(input);
    this.replace(mode === 'replace' ? incoming : mergeCoursePlannerStates(this.state(), incoming));
  }

  clear(): void {
    this.replace(structuredClone(EMPTY_COURSE_PLANNER_STATE));
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(COURSE_PLANNER_STORAGE_KEY);
      if (!raw) return;
      this.state.set(normalizeCoursePlannerState(JSON.parse(raw)));
      this.lastSavedAt.set(this.state().updatedAt);
    } catch (error) {
      this.storageError.set(error instanceof Error ? error.message : 'Die lokalen Daten konnten nicht geladen werden.');
    }
  }

  private change(updater: (state: CoursePlannerState) => void): void {
    const state = structuredClone(this.state());
    updater(state);
    state.updatedAt = new Date().toISOString();
    this.replace(state);
  }

  private replace(state: CoursePlannerState): void {
    this.state.set(state);
    this.persist();
  }

  private persist(): void {
    this.saving.set(true);
    this.storageError.set('');
    try {
      const json = JSON.stringify(this.state());
      normalizeCoursePlannerState(JSON.parse(json));
      localStorage.setItem(COURSE_PLANNER_STORAGE_KEY, json);
      this.lastSavedAt.set(this.state().updatedAt);
    } catch (error) {
      this.storageError.set(error instanceof Error ? error.message : 'Speichern im Browser ist fehlgeschlagen.');
    } finally {
      this.saving.set(false);
    }
  }
}

