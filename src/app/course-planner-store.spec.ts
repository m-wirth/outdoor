import { beforeEach, describe, expect, it } from 'vitest';
import { COURSE_PLANNER_STORAGE_KEY, CoursePlannerStore } from './course-planner-store.service';

describe('CoursePlannerStore', () => {
  beforeEach(() => localStorage.clear());

  it('speichert den versionierten Zustand im localStorage und lädt ihn wieder', () => {
    const store = new CoursePlannerStore();
    store.createTrainingEvent({ name: 'GTQ', startDate: '2026-10-03', endDate: '2026-10-10', mainInstructor: '' });
    const raw = JSON.parse(localStorage.getItem(COURSE_PLANNER_STORAGE_KEY) ?? '{}');
    expect(raw).toMatchObject({ schemaVersion: 1, trainingEvents: [{ name: 'GTQ' }] });
    expect(new CoursePlannerStore().state().trainingEvents[0].name).toBe('GTQ');
  });

  it('verschiebt eine Einplanung zwischen Kursen ohne sie zu duplizieren', () => {
    const store = new CoursePlannerStore();
    const event = store.createTrainingEvent({ name: 'GTQ', startDate: '2026-10-03', endDate: '2026-10-10', mainInstructor: '' });
    const glk = store.createCourse({ trainingEventId: event.id, name: 'GLK', startDate: event.startDate, endDate: event.endDate, location: '', frameworkId: undefined });
    const tlk = store.createCourse({ trainingEventId: event.id, name: 'TLK', startDate: event.startDate, endDate: event.endDate, location: '', frameworkId: undefined });
    const lesson = store.saveLesson({ category: 'E', number: '1', title: 'Sicherheit', summary: '', durationMinutes: 90, goals: [], participantDocuments: '', instructorDocuments: '', teachingReferences: '', material: '', steps: [] });
    const placement = store.createPlacement({ lessonId: lesson.id, courseId: glk.id, date: event.startDate, startTime: '08:00', location: '' });
    store.updatePlacement(placement.id, { courseId: tlk.id, startTime: '09:15' });
    expect(store.state().placements).toHaveLength(1);
    expect(store.state().placements[0]).toMatchObject({ id: placement.id, courseId: tlk.id, startTime: '09:15' });
  });

  it('verhindert Kursdaten ausserhalb der Kursveranstaltung', () => {
    const store = new CoursePlannerStore();
    const event = store.createTrainingEvent({ name: 'GTQ', startDate: '2026-10-03', endDate: '2026-10-10', mainInstructor: '' });
    expect(() => store.createCourse({ trainingEventId: event.id, name: 'Zu lang', startDate: '2026-10-02', endDate: '2026-10-10', location: '', frameworkId: undefined })).toThrow('innerhalb');
    const course = store.createCourse({ trainingEventId: event.id, name: 'GLK', startDate: event.startDate, endDate: event.endDate, location: '', frameworkId: undefined });
    expect(() => store.updateCourse(course.id, { endDate: '2026-10-11' })).toThrow('innerhalb');
    expect(() => store.updateTrainingEvent(event.id, { endDate: '2026-10-09' })).toThrow('ausserhalb');
  });

  it('dupliziert eine Lektion als unabhängigen Inhalt am gleichen Termin', () => {
    const store = new CoursePlannerStore();
    const event = store.createTrainingEvent({ name: 'GTQ', startDate: '2026-10-03', endDate: '2026-10-10', mainInstructor: '' });
    const course = store.createCourse({ trainingEventId: event.id, name: 'GLK', startDate: event.startDate, endDate: event.endDate, location: '', frameworkId: undefined });
    const lesson = store.saveLesson({ category: 'E', number: '1', title: 'Sicherheit', summary: '', durationMinutes: 90, goals: [], participantDocuments: '', instructorDocuments: '', teachingReferences: '', material: '', steps: [] });
    const placement = store.createPlacement({ lessonId: lesson.id, courseId: course.id, date: event.startDate, startTime: '08:00', location: '' });
    const copy = store.duplicateLesson(lesson.id, placement.id);
    expect(copy.lesson.id).not.toBe(lesson.id);
    expect(copy.lesson.title).toBe('Kopie von Sicherheit');
    expect(copy.placement).toMatchObject({ courseId: course.id, date: event.startDate, startTime: '08:00', lessonId: copy.lesson.id });
    store.updateCourse(course.id, { name: 'GLK neu' });
    store.saveLesson({ ...copy.lesson, title: 'Eigene Kopie' });
    expect(store.state().lessons.find((item) => item.id === lesson.id)?.title).toBe('Sicherheit');
  });

  it('stellt Backups in den Modi Ersetzen und Zusammenführen wieder her', () => {
    const source = new CoursePlannerStore();
    source.createTrainingEvent({ name: 'Quelle', startDate: '2026-10-03', endDate: '2026-10-10', mainInstructor: '' });
    const backup = structuredClone(source.state());
    localStorage.clear();
    const target = new CoursePlannerStore();
    target.createTrainingEvent({ name: 'Lokal', startDate: '2027-01-01', endDate: '2027-01-02', mainInstructor: '' });
    target.restore(backup, 'merge');
    expect(target.state().trainingEvents.map((item) => item.name).sort()).toEqual(['Lokal', 'Quelle']);
    target.restore(backup, 'replace');
    expect(target.state().trainingEvents.map((item) => item.name)).toEqual(['Quelle']);
  });
});

