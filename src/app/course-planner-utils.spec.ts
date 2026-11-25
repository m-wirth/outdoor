import { describe, expect, it } from 'vitest';
import { EMPTY_COURSE_PLANNER_STATE, Lesson, LessonPlacement } from './course-planner.models';
import {
  assignPlacementLanes,
  courseWithinEvent,
  courseGoalCoverage,
  datesBetween,
  importPersonalPlanner,
  lessonStepTotal,
  mergeCoursePlannerStates,
  normalizeCoursePlannerState,
  validatePersonalPlanner
} from './course-planner.utils';

const plannerFile = {
  version: 1,
  trainings: [{
    id: 'training-1',
    name: 'GTQ 2026-2',
    startDate: '2026-10-03',
    endDate: '2026-10-10',
    mainInstructor: 'Marco Wirth',
    subTrainings: [
      { id: 'glk', name: 'GLK', instructors: [] as string[] },
      { id: 'tlk', name: 'TLK', instructors: [] },
      { id: 'quem', name: 'QUEM', instructors: [] }
    ],
    people: [], presence: {}, absences: []
  }]
};

describe('Personalplaner-Import', () => {
  it('validiert Feldpfade und Datumswerte verständlich', () => {
    expect(() => validatePersonalPlanner({ version: 1, trainings: [{ id: 'x', name: 'Test', endDate: '2026-10-03' }] }))
      .toThrow('trainings[0].startDate fehlt');
    expect(() => validatePersonalPlanner({ version: 1, trainings: [{ id: 'x', name: 'Test', startDate: 'falsch', endDate: '2026-10-03' }] }))
      .toThrow('trainings[0].startDate ist kein gültiges Datum');
  });

  it('übernimmt die Kursstruktur aus dem aktuellen Datenformat ohne Personen- und Absenzenlisten', () => {
    const current = structuredClone(plannerFile);
    current.trainings[0].subTrainings[0].instructors = ['Leitung'];
    const parsed = validatePersonalPlanner(current);
    expect(parsed.trainings[0].subTrainings?.[0].instructors).toEqual(['Leitung']);
    expect(parsed.trainings[0]).not.toHaveProperty('people');
    expect(parsed.trainings[0]).not.toHaveProperty('presence');
    expect(parsed.trainings[0]).not.toHaveProperty('absences');
  });

  it('erhält eine zuerst importierte Kopie bei regulären Aktualisierungen', () => {
    const parsed = validatePersonalPlanner(plannerFile);
    const copy = importPersonalPlanner(EMPTY_COURSE_PLANNER_STATE, parsed, ['training-1'], true);
    const original = importPersonalPlanner(copy.state, parsed, ['training-1']);
    const changed = validatePersonalPlanner({ ...plannerFile, trainings: [{ ...plannerFile.trainings[0], name: 'Neuer Name' }] });
    const updated = importPersonalPlanner(original.state, changed, ['training-1']);
    expect(updated.state.trainingEvents.map((item) => item.name)).toEqual(['GTQ 2026-2', 'Neuer Name']);
  });

  it('weist eine Terminänderung zurück, wenn sie Einplanungen ausserhalb des Kurses hinterlässt', () => {
    const parsed = validatePersonalPlanner(plannerFile);
    const initial = importPersonalPlanner(EMPTY_COURSE_PLANNER_STATE, parsed, ['training-1']);
    initial.state.placements.push(placement('p1', 'l1', initial.state.courses[0].id));
    const shortened = validatePersonalPlanner({ ...plannerFile, trainings: [{ ...plannerFile.trainings[0], startDate: '2026-10-04' }] });
    expect(() => importPersonalPlanner(initial.state, shortened, ['training-1'])).toThrow('bestehenden Einplanungen');
    expect(initial.state.trainingEvents[0].startDate).toBe('2026-10-03');
  });

  it('bildet ein Training auf eine Veranstaltung mit drei parallelen Kursen ab', () => {
    let id = 0;
    const parsed = validatePersonalPlanner(plannerFile);
    const result = importPersonalPlanner(structuredClone(EMPTY_COURSE_PLANNER_STATE), parsed, ['training-1'], false, (prefix) => `${prefix}-${++id}`, '2026-09-01T00:00:00Z');
    expect(result.createdEvents).toBe(1);
    expect(result.createdCourses).toBe(3);
    expect(result.state.trainingEvents[0]).toMatchObject({ name: 'GTQ 2026-2', startDate: '2026-10-03', endDate: '2026-10-10' });
    expect(result.state.courses.map((course) => course.name)).toEqual(['GLK', 'TLK', 'QUEM']);
  });

  it('ist bei erneutem Import idempotent und erhält Einplanungen', () => {
    let id = 0;
    const parsed = validatePersonalPlanner(plannerFile);
    const first = importPersonalPlanner(structuredClone(EMPTY_COURSE_PLANNER_STATE), parsed, ['training-1'], false, (prefix) => `${prefix}-${++id}`);
    first.state.lessons.push(lesson('l1'));
    first.state.placements.push(placement('p1', 'l1', first.state.courses[0].id));
    const second = importPersonalPlanner(first.state, parsed, ['training-1'], false, (prefix) => `${prefix}-${++id}`);
    expect(second.createdEvents).toBe(0);
    expect(second.updatedEvents).toBe(1);
    expect(second.state.trainingEvents).toHaveLength(1);
    expect(second.state.courses).toHaveLength(3);
    expect(second.state.placements).toHaveLength(1);
  });
});

describe('Kursplaner-Berechnungen', () => {
  it('begrenzt parallele Kurse auf den Zeitraum der Kursveranstaltung', () => {
    const event = { startDate: '2026-10-03', endDate: '2026-10-10' };
    expect(courseWithinEvent({ startDate: '2026-10-03', endDate: '2026-10-10' }, event)).toBe(true);
    expect(courseWithinEvent({ startDate: '2026-10-02', endDate: '2026-10-10' }, event)).toBe(false);
    expect(courseWithinEvent({ startDate: '2026-10-03', endDate: '2026-10-11' }, event)).toBe(false);
  });
  it('behandelt den Zeitraum inklusive Start- und Enddatum', () => {
    expect(datesBetween('2026-10-03', '2026-10-05')).toEqual(['2026-10-03', '2026-10-04', '2026-10-05']);
  });

  it('summiert Ablaufschritte unabhängig von der Lektionsdauer', () => {
    const item = lesson('l1');
    item.steps = [
      { id: 's1', title: 'Start', description: '', durationMinutes: 15, order: 0 },
      { id: 's2', title: 'Praxis', description: '', durationMinutes: 40, order: 1 }
    ];
    expect(lessonStepTotal(item)).toBe(55);
    expect(item.durationMinutes).toBe(90);
  });

  it('ordnet parallele Lektionen in getrennte Lanes ein', () => {
    const lessons = [lesson('l1'), { ...lesson('l2'), durationMinutes: 45 }];
    const lanes = assignPlacementLanes([
      placement('p1', 'l1', 'c1', '08:00'),
      placement('p2', 'l2', 'c1', '08:15')
    ], lessons);
    expect(new Set(lanes.map((item) => item.lane)).size).toBe(2);
    expect(lanes.every((item) => item.laneCount === 2)).toBe(true);
  });

  it('berechnet Zielabdeckung aus global referenzierten Lektionen', () => {
    const state = structuredClone(EMPTY_COURSE_PLANNER_STATE);
    state.courses.push({ id: 'c1', trainingEventId: 'e1', name: 'GLK', startDate: '2026-10-03', endDate: '2026-10-10', location: '', frameworkId: 'js-leitendenkurs-lst', createdAt: '', updatedAt: '' });
    const item = lesson('l1');
    item.goals = [{ type: 'js', frameworkId: 'js-leitendenkurs-lst', goalId: 'js-leitendenkurs-lst:1.1' }];
    state.lessons.push(item);
    state.placements.push(placement('p1', 'l1', 'c1'));
    const coverage = courseGoalCoverage(state, 'c1');
    expect(coverage.find((row) => row.code === '1.1')?.lessons.map((value) => value.id)).toEqual(['l1']);
    expect(coverage.some((row) => row.lessons.length === 0)).toBe(true);
  });

  it('zeigt eigene Ziele auch ohne J+S-Rahmen und zählt dieselbe Lektion nur einmal', () => {
    const state = structuredClone(EMPTY_COURSE_PLANNER_STATE);
    state.courses.push({ id: 'c1', trainingEventId: 'e1', name: 'GLK', startDate: '2026-10-03', endDate: '2026-10-10', location: '', createdAt: '', updatedAt: '' });
    state.customGoalCategories.push({ id: 'cat', name: 'Verband', color: '#47745a', order: 0 });
    state.customGoals.push(
      { id: 'g1', categoryId: 'cat', text: 'Abgedecktes Ziel', order: 0 },
      { id: 'g2', categoryId: 'cat', text: 'Offenes Ziel', order: 1 }
    );
    const item = lesson('l1');
    item.goals = [{ type: 'custom', goalId: 'g1' }];
    state.lessons.push(item);
    state.placements.push(placement('p1', 'l1', 'c1'), placement('p2', 'l1', 'c1', '10:00'));
    expect(courseGoalCoverage(state, 'c1').map((row) => [row.key, row.lessons.length]))
      .toEqual([['custom:g1', 1], ['custom:g2', 0]]);
  });

  it('validiert und führt Backups anhand interner IDs zusammen', () => {
    const current = structuredClone(EMPTY_COURSE_PLANNER_STATE);
    current.lessons.push(lesson('l1'));
    const incoming = structuredClone(EMPTY_COURSE_PLANNER_STATE);
    incoming.lessons.push(lesson('l1'), lesson('l2'));
    const merged = mergeCoursePlannerStates(current, normalizeCoursePlannerState(incoming));
    expect(merged.lessons.map((item) => item.id)).toEqual(['l1', 'l2']);
  });
});

function lesson(id: string): Lesson {
  return {
    id, category: 'E', number: '1a', title: 'Testlektion', summary: '', durationMinutes: 90, goals: [], participantDocuments: '', instructorDocuments: '', teachingReferences: '', material: '', steps: [], createdAt: '', updatedAt: ''
  };
}

function placement(id: string, lessonId: string, courseId: string, startTime = '08:00'): LessonPlacement {
  return { id, lessonId, courseId, date: '2026-10-03', startTime, location: '', createdAt: '', updatedAt: '' };
}

