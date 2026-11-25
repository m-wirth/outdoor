import { FRAMEWORK_BY_ID } from './course-planner.data';
import {
  Course,
  CoursePlannerState,
  EMPTY_COURSE_PLANNER_STATE,
  GoalReference,
  JsFrameworkId,
  Lesson,
  LessonPlacement,
  PersonalPlannerFile,
  PersonalPlannerTraining,
  TrainingEvent
} from './course-planner.models';

export interface ImportResult {
  state: CoursePlannerState;
  createdEvents: number;
  updatedEvents: number;
  createdCourses: number;
  updatedCourses: number;
}

export interface PlacementLane {
  placementId: string;
  lane: number;
  laneCount: number;
}

export function uid(prefix: string): string {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

export function datesBetween(startDate: string, endDate: string): string[] {
  if (!isLocalDate(startDate) || !isLocalDate(endDate) || endDate < startDate) return [];
  const dates: string[] = [];
  const cursor = new Date(`${startDate}T12:00:00`);
  const end = new Date(`${endDate}T12:00:00`);
  while (cursor <= end) {
    dates.push(localDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}

export function courseWithinEvent(
  course: Pick<Course, 'startDate' | 'endDate'>,
  event: Pick<TrainingEvent, 'startDate' | 'endDate'>
): boolean {
  return course.startDate >= event.startDate && course.endDate <= event.endDate && course.endDate >= course.startDate;
}

export function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dateLabel(date: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: '2-digit', month: '2-digit' }): string {
  return new Intl.DateTimeFormat('de-CH', options).format(new Date(`${date}T12:00:00`));
}

export function minutesFromTime(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours * 60) + minutes;
}

export function timeFromMinutes(value: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

export function addMinutes(time: string, durationMinutes: number): string {
  return timeFromMinutes(minutesFromTime(time) + durationMinutes);
}

export function snapToQuarter(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

export function lessonCode(lesson: Pick<Lesson, 'category' | 'number'>): string {
  return `${lesson.category}${lesson.number.trim()}`;
}

export function lessonStepTotal(lesson: Pick<Lesson, 'steps'>): number {
  return lesson.steps.reduce((sum, step) => sum + Math.max(0, Number(step.durationMinutes) || 0), 0);
}

export function assignPlacementLanes(placements: LessonPlacement[], lessons: Lesson[]): PlacementLane[] {
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const sorted = [...placements].sort((left, right) => minutesFromTime(left.startTime) - minutesFromTime(right.startTime));
  const lanes: Array<{ end: number; placementId: string }> = [];
  const assignments = new Map<string, number>();

  for (const placement of sorted) {
    const start = minutesFromTime(placement.startTime);
    const end = start + (lessonById.get(placement.lessonId)?.durationMinutes ?? 15);
    let lane = lanes.findIndex((entry) => entry.end <= start);
    if (lane < 0) lane = lanes.length;
    lanes[lane] = { end, placementId: placement.id };
    assignments.set(placement.id, lane);
  }

  let laneCount = 1;
  for (let index = 0; index < sorted.length; index++) {
    const item = sorted[index];
    const itemStart = minutesFromTime(item.startTime);
    const itemEnd = itemStart + (lessonById.get(item.lessonId)?.durationMinutes ?? 15);
    const overlapping = sorted.filter((other) => {
      const otherStart = minutesFromTime(other.startTime);
      const otherEnd = otherStart + (lessonById.get(other.lessonId)?.durationMinutes ?? 15);
      return otherStart < itemEnd && otherEnd > itemStart;
    });
    laneCount = Math.max(laneCount, ...overlapping.map((entry) => (assignments.get(entry.id) ?? 0) + 1));
  }

  return sorted.map((placement) => ({ placementId: placement.id, lane: assignments.get(placement.id) ?? 0, laneCount }));
}

export function validatePersonalPlanner(input: unknown): PersonalPlannerFile {
  if (!input || typeof input !== 'object') throw new Error('Die Datei muss ein JSON-Objekt enthalten.');
  const root = input as Record<string, unknown>;
  if (root['version'] !== 1) throw new Error('version muss 1 sein.');
  if (!Array.isArray(root['trainings'])) throw new Error('trainings fehlt oder ist keine Liste.');
  const trainings = root['trainings'].map((item, index) => validatePersonalPlannerTraining(item, `trainings[${index}]`));
  requireUniqueIds(trainings, 'trainings');
  return { version: 1, trainings };
}

function requireUniqueIds(items: { id: string }[], path: string): void {
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new Error(`${path} enthält doppelte IDs.`);
}

function validatePersonalPlannerTraining(input: unknown, path: string): PersonalPlannerTraining {
  if (!input || typeof input !== 'object') throw new Error(`${path} ist ungültig.`);
  const item = input as Record<string, unknown>;
  for (const field of ['id', 'name', 'startDate', 'endDate']) {
    if (typeof item[field] !== 'string' || !String(item[field]).trim()) throw new Error(`${path}.${field} fehlt.`);
  }
  if (!isLocalDate(String(item['startDate']))) throw new Error(`${path}.startDate ist kein gültiges Datum.`);
  if (!isLocalDate(String(item['endDate']))) throw new Error(`${path}.endDate ist kein gültiges Datum.`);
  if (String(item['endDate']) < String(item['startDate'])) throw new Error(`${path}.endDate liegt vor startDate.`);
  if (item['subTrainings'] !== undefined && !Array.isArray(item['subTrainings'])) throw new Error(`${path}.subTrainings ist keine Liste.`);
  const subTrainings = (item['subTrainings'] as unknown[] | undefined)?.map((course, courseIndex) => {
    if (!course || typeof course !== 'object') throw new Error(`${path}.subTrainings[${courseIndex}] ist ungültig.`);
    const row = course as Record<string, unknown>;
    if (typeof row['id'] !== 'string' || !row['id']) throw new Error(`${path}.subTrainings[${courseIndex}].id fehlt.`);
    if (typeof row['name'] !== 'string' || !row['name'].trim()) throw new Error(`${path}.subTrainings[${courseIndex}].name fehlt.`);
    const instructors = row['instructors'] ?? [];
    if (!Array.isArray(instructors) || instructors.some((name) => typeof name !== 'string')) {
      throw new Error(`${path}.subTrainings[${courseIndex}].instructors enthält ungültige Namen.`);
    }
    return { id: row['id'], name: row['name'], instructors: [...instructors] };
  });
  requireUniqueIds(subTrainings ?? [], `${path}.subTrainings`);
  for (const field of ['mainInstructor', 'updatedAt']) {
    if (item[field] !== undefined && typeof item[field] !== 'string') throw new Error(`${path}.${field} ist ungültig.`);
  }
  const { id, name, startDate, endDate, mainInstructor, updatedAt } = item as unknown as PersonalPlannerTraining;
  return { id, name, startDate, endDate, mainInstructor, updatedAt, subTrainings };
}

export function importPersonalPlanner(
  current: CoursePlannerState,
  input: PersonalPlannerFile,
  selectedTrainingIds: string[],
  asCopy = false,
  makeId: (prefix: string) => string = uid,
  now = new Date().toISOString()
): ImportResult {
  const state = structuredClone(current);
  const importedEventIds = new Set<string>();
  let createdEvents = 0;
  let updatedEvents = 0;
  let createdCourses = 0;
  let updatedCourses = 0;

  for (const training of input.trainings.filter((item) => selectedTrainingIds.includes(item.id))) {
    let event = asCopy ? undefined : state.trainingEvents.find((item) => item.source?.trainingId === training.id && !item.source.independentCopy);
    if (!event) {
      event = {
        id: makeId('event'),
        name: training.name,
        startDate: training.startDate,
        endDate: training.endDate,
        mainInstructor: training.mainInstructor ?? '',
        source: { type: 'personal-planner', version: input.version, trainingId: training.id, importedAt: now, sourceUpdatedAt: training.updatedAt, independentCopy: asCopy },
        createdAt: now,
        updatedAt: now
      };
      state.trainingEvents.push(event);
      createdEvents++;
    } else {
      Object.assign(event, {
        name: training.name,
        startDate: training.startDate,
        endDate: training.endDate,
        mainInstructor: training.mainInstructor ?? event.mainInstructor,
        source: { ...event.source, importedAt: now, sourceUpdatedAt: training.updatedAt },
        updatedAt: now
      });
      updatedEvents++;
    }

    importedEventIds.add(event.id);
    const subTrainings = training.subTrainings?.length
      ? training.subTrainings
      : [{ id: `${training.id}:default`, name: training.name, instructors: [] }];
    for (const sourceCourse of subTrainings) {
      const existing = asCopy ? undefined : state.courses.find((item) => item.trainingEventId === event.id && item.sourceSubTrainingId === sourceCourse.id);
      if (existing) {
        existing.name = sourceCourse.name;
        existing.startDate = training.startDate;
        existing.endDate = training.endDate;
        existing.importedInstructors = sourceCourse.instructors ?? [];
        existing.updatedAt = now;
        updatedCourses++;
      } else {
        state.courses.push({
          id: makeId('course'),
          trainingEventId: event.id,
          name: sourceCourse.name,
          startDate: training.startDate,
          endDate: training.endDate,
          location: '',
          sourceSubTrainingId: sourceCourse.id,
          importedInstructors: sourceCourse.instructors ?? [],
          createdAt: now,
          updatedAt: now
        });
        createdCourses++;
      }
    }
  }

  for (const course of state.courses) {
    const event = state.trainingEvents.find((item) => item.id === course.trainingEventId);
    if (!event || !importedEventIds.has(event.id)) continue;
    if (!courseWithinEvent(course, event) || state.placements.some((item) =>
      item.courseId === course.id && !placementWithinCourse(item.date, course)
    )) {
      throw new Error(`«${event.name}» kann nicht aktualisiert werden. Der neue Zeitraum kollidiert mit dem Kurs oder bestehenden Einplanungen von «${course.name}».`);
    }
  }
  state.updatedAt = now;
  return { state, createdEvents, updatedEvents, createdCourses, updatedCourses };
}

export function normalizeCoursePlannerState(input: unknown): CoursePlannerState {
  if (!input || typeof input !== 'object') throw new Error('Die Sicherung enthält kein gültiges Objekt.');
  const state = input as Partial<CoursePlannerState>;
  if (state.schemaVersion !== 1) throw new Error('Diese Schemaversion wird nicht unterstützt.');
  const listNames: Array<keyof CoursePlannerState> = ['trainingEvents', 'courses', 'lessons', 'placements', 'customGoalCategories', 'customGoals'];
  for (const name of listNames) {
    if (!Array.isArray(state[name])) throw new Error(`${name} fehlt oder ist keine Liste.`);
  }
  return {
    ...structuredClone(EMPTY_COURSE_PLANNER_STATE),
    ...structuredClone(state),
    settings: { ...EMPTY_COURSE_PLANNER_STATE.settings, ...(state.settings ?? {}) },
    updatedAt: typeof state.updatedAt === 'string' ? state.updatedAt : new Date().toISOString()
  } as CoursePlannerState;
}

export function mergeCoursePlannerStates(current: CoursePlannerState, incoming: CoursePlannerState): CoursePlannerState {
  const state = structuredClone(current);
  mergeById(state.trainingEvents, incoming.trainingEvents);
  mergeById(state.courses, incoming.courses);
  mergeById(state.lessons, incoming.lessons);
  mergeById(state.placements, incoming.placements);
  mergeById(state.customGoalCategories, incoming.customGoalCategories);
  mergeById(state.customGoals, incoming.customGoals);
  state.settings = { ...incoming.settings, ...state.settings };
  state.updatedAt = new Date().toISOString();
  return state;
}

function mergeById<T extends { id: string }>(target: T[], source: T[]): void {
  const known = new Set(target.map((item) => item.id));
  target.push(...structuredClone(source.filter((item) => !known.has(item.id))));
}

export function goalReferenceKey(reference: GoalReference): string {
  return reference.type === 'js' ? `js:${reference.frameworkId}:${reference.goalId}` : `custom:${reference.goalId}`;
}

export function courseGoalCoverage(state: CoursePlannerState, courseId: string) {
  const course = state.courses.find((item) => item.id === courseId);
  if (!course) return [];
  const framework = course.frameworkId ? FRAMEWORK_BY_ID.get(course.frameworkId) : undefined;
  const lessonIds = new Set(state.placements.filter((item) => item.courseId === courseId).map((item) => item.lessonId));
  const lessonsByGoal = new Map<string, Lesson[]>();
  for (const lesson of state.lessons.filter((item) => lessonIds.has(item.id))) {
    for (const key of new Set(lesson.goals.map(goalReferenceKey))) {
      const lessons = lessonsByGoal.get(key) ?? [];
      lessons.push(lesson);
      lessonsByGoal.set(key, lessons);
    }
  }

  const groups = state.customGoalCategories.slice().sort((left, right) => left.order - right.order);
  const custom = groups.flatMap((category) => state.customGoals
    .filter((goal) => goal.categoryId === category.id)
    .sort((left, right) => left.order - right.order)
    .map((goal) => ({ ...goal, code: goal.code ?? '', key: `custom:${goal.id}`, group: category.name })));
  const standard = framework?.goals.map((goal) => ({
    ...goal, key: `js:${framework.id}:${goal.id}`, group: framework.shortName
  })) ?? [];

  return [...standard, ...custom].map((goal) => ({
    goalId: goal.id, key: goal.key, group: goal.group, code: goal.code, text: goal.text,
    lessons: lessonsByGoal.get(goal.key) ?? []
  }));
}

export function placementWithinCourse(date: string, course: Pick<Course, 'startDate' | 'endDate'>): boolean {
  return isLocalDate(date) && date >= course.startDate && date <= course.endDate;
}

export function isLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.valueOf()) && localDate(date) === value;
}

export function frameworkName(id?: JsFrameworkId): string {
  return id ? FRAMEWORK_BY_ID.get(id)?.shortName ?? id : 'Kein Orientierungsrahmen';
}

export function trainingPreview(item: PersonalPlannerTraining): string {
  const count = item.subTrainings?.length || 1;
  return `${dateLabel(item.startDate, { day: '2-digit', month: '2-digit', year: 'numeric' })}–${dateLabel(item.endDate, { day: '2-digit', month: '2-digit', year: 'numeric' })} · ${count} ${count === 1 ? 'Kurs' : 'Kurse'}`;
}

