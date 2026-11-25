import { NgStyle } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, HostListener, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { JS_FRAMEWORKS } from './course-planner.data';
import {
  Course,
  CustomGoal,
  CustomGoalCategory,
  GoalReference,
  JsFrameworkId,
  Lesson,
  LessonCategory,
  LessonPlacement,
  LessonStep,
  LESSON_CATEGORIES,
  PersonalPlannerFile,
  TrainingEvent
} from './course-planner.models';
import { PlannerStore } from './planner-store.service';
import { CoursePlannerStore } from './course-planner-store.service';
import {
  addMinutes,
  assignPlacementLanes,
  courseWithinEvent,
  courseGoalCoverage,
  dateLabel,
  datesBetween,
  frameworkName,
  goalReferenceKey,
  lessonCode,
  lessonStepTotal,
  minutesFromTime,
  placementWithinCourse,
  snapToQuarter,
  timeFromMinutes,
  trainingPreview,
  uid,
  validatePersonalPlanner
} from './course-planner.utils';

const SCHEDULE_DRAG_TYPE = 'application/x-trailbox-schedule';
const PIXELS_PER_MINUTE = 0.8;

type PlannerTab = 'events' | 'program' | 'lessons' | 'goals' | 'transfer';
type Modal = 'event' | 'course' | 'lesson' | 'placement' | 'actions' | 'detail' | null;
type PrintMode = 'program' | 'lesson' | null;

interface EventDraft {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  mainInstructor: string;
}

interface CourseDraft {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  location: string;
  frameworkId: JsFrameworkId | '';
}

interface LessonDraft {
  id?: string;
  category: LessonCategory;
  number: string;
  title: string;
  summary: string;
  durationMinutes: number;
  participantDocuments: string;
  instructorDocuments: string;
  teachingReferences: string;
  material: string;
  steps: LessonStep[];
  goalKeys: string[];
}

interface PlacementDraft {
  id?: string;
  lessonId: string;
  courseId: string;
  date: string;
  startTime: string;
  location: string;
}

const EMPTY_EVENT: EventDraft = { name: '', startDate: '', endDate: '', mainInstructor: '' };
const EMPTY_COURSE: CourseDraft = { name: '', startDate: '', endDate: '', location: '', frameworkId: '' };
const EMPTY_LESSON: LessonDraft = {
  category: 'A', number: '', title: '', summary: '', durationMinutes: 90,
  participantDocuments: '', instructorDocuments: '', teachingReferences: '', material: '', steps: [], goalKeys: []
};

@Component({
  selector: 'app-course-planner',
  imports: [FormsModule, NgStyle],
  templateUrl: './course-planner.component.html',
  styleUrl: './course-planner.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CoursePlannerComponent {
  readonly store = inject(CoursePlannerStore);
  readonly personalPlanner = inject(PlannerStore);
  readonly categories = LESSON_CATEGORIES;
  readonly frameworks = JS_FRAMEWORKS;
  readonly tabs: Array<{ id: PlannerTab; label: string }> = [
    { id: 'events', label: 'Kursveranstaltungen' },
    { id: 'program', label: 'Kursprogramm' },
    { id: 'lessons', label: 'Lektionen' },
    { id: 'goals', label: 'Ziele' },
    { id: 'transfer', label: 'Import & Export' }
  ];

  readonly tab = signal<PlannerTab>('events');
  readonly modal = signal<Modal>(null);
  readonly toast = signal('');
  readonly formError = signal('');
  readonly lessonSearch = signal('');
  readonly goalSearch = signal('');
  readonly coverageOnlyMissing = signal(false);
  readonly coverageCourseId = signal('');
  readonly focusedDate = signal('');
  readonly actionPlacementId = signal('');
  readonly detailLessonId = signal('');
  readonly printMode = signal<PrintMode>(null);
  readonly printLessonIds = signal<string[]>([]);
  readonly selectedLessonPrintIds = signal<string[]>([]);
  readonly visibleCourseIds = signal<string[] | null>(null);
  readonly personalPlannerPreview = signal<PersonalPlannerFile | null>(null);
  readonly selectedImportIds = signal<string[]>([]);
  readonly importAsCopy = signal(false);
  readonly backupMode = signal<'replace' | 'merge'>('merge');
  readonly dropTarget = signal<{ courseId: string; date: string; startTime: string; top: number } | null>(null);
  private drag: { type: 'lesson' | 'placement'; id: string; offset: number } | null = null;

  eventDraft: EventDraft = { ...EMPTY_EVENT };
  courseDraft: CourseDraft = { ...EMPTY_COURSE };
  lessonDraft: LessonDraft = structuredClone(EMPTY_LESSON);
  placementDraft: PlacementDraft = { lessonId: '', courseId: '', date: '', startTime: '08:00', location: '' };
  goalCategoryDraft: Pick<CustomGoalCategory, 'name' | 'shortName' | 'color'> = { name: '', shortName: '', color: '#47745a' };
  customGoalDraft: Pick<CustomGoal, 'categoryId' | 'code' | 'text' | 'note'> = { categoryId: '', code: '', text: '', note: '' };

  readonly state = this.store.state;
  readonly activeEvent = computed(() => {
    const state = this.state();
    return state.trainingEvents.find((item) => item.id === state.settings.activeTrainingEventId) ?? state.trainingEvents[0] ?? null;
  });
  readonly activeEventId = computed(() => this.activeEvent()?.id ?? '');
  readonly activeEventName = computed(() => this.activeEvent()?.name ?? '');
  readonly activeEventStart = computed(() => this.activeEvent()?.startDate ?? '');
  readonly activeEventEnd = computed(() => this.activeEvent()?.endDate ?? '');
  readonly activeCourses = computed(() => {
    const event = this.activeEvent();
    return event ? this.state().courses.filter((item) => item.trainingEventId === event.id) : [];
  });
  readonly programCourses = computed(() => {
    const selected = this.visibleCourseIds();
    return selected === null ? this.activeCourses() : this.activeCourses().filter((item) => selected.includes(item.id));
  });
  readonly eventDates = computed(() => {
    const event = this.activeEvent();
    return event ? datesBetween(event.startDate, event.endDate) : [];
  });
  readonly visibleDates = computed(() => this.focusedDate() ? [this.focusedDate()] : this.eventDates());
  readonly filteredLessons = computed(() => {
    const query = this.lessonSearch().trim().toLocaleLowerCase('de-CH');
    return this.state().lessons
      .filter((lesson) => !query || `${lessonCode(lesson)} ${lesson.title} ${lesson.summary}`.toLocaleLowerCase('de-CH').includes(query))
      .sort((left, right) => lessonCode(left).localeCompare(lessonCode(right), 'de-CH', { numeric: true }));
  });
  readonly unplannedLessons = computed(() => {
    const courseIds = new Set(this.activeCourses().map((item) => item.id));
    const used = new Set(this.state().placements.filter((item) => courseIds.has(item.courseId)).map((item) => item.lessonId));
    return this.filteredLessons().filter((item) => !used.has(item.id));
  });
  readonly timelineStartHour = computed(() => {
    const courseIds = new Set(this.programCourses().map((item) => item.id));
    const starts = this.state().placements.filter((item) => courseIds.has(item.courseId)).map((item) => minutesFromTime(item.startTime));
    return Math.min(6, ...starts.map((value) => Math.floor(value / 60)));
  });
  readonly timelineEndHour = computed(() => {
    const courseIds = new Set(this.programCourses().map((item) => item.id));
    const lessons = new Map(this.state().lessons.map((item) => [item.id, item]));
    const ends = this.state().placements.filter((item) => courseIds.has(item.courseId)).map((item) => minutesFromTime(item.startTime) + (lessons.get(item.lessonId)?.durationMinutes ?? 0));
    return Math.max(22, ...ends.map((value) => Math.ceil(value / 60)));
  });
  readonly timelineHours = computed(() => Array.from(
    { length: this.timelineEndHour() - this.timelineStartHour() + 1 },
    (_, index) => this.timelineStartHour() + index
  ));
  readonly scheduleHeight = computed(() => (this.timelineEndHour() - this.timelineStartHour()) * 48);
  readonly activeActionPlacement = computed(() => this.state().placements.find((item) => item.id === this.actionPlacementId()) ?? null);
  readonly detailLesson = computed(() => this.state().lessons.find((item) => item.id === this.detailLessonId()) ?? null);
  readonly coverageCourse = computed<Course | undefined>(() => {
    const courses = this.activeCourses();
    return courses.find((course) => course.id === this.coverageCourseId()) ?? courses[0];
  });
  readonly allCoverage = computed(() => courseGoalCoverage(this.state(), this.coverageCourse()?.id ?? ''));
  readonly coveredGoalCount = computed(() => this.allCoverage().filter((row) => row.lessons.length > 0).length);
  readonly coverage = computed(() => this.coverageOnlyMissing()
    ? this.allCoverage().filter((row) => row.lessons.length === 0)
    : this.allCoverage());
  readonly customGoalsByCategory = computed(() => this.state().customGoalCategories
    .slice().sort((left, right) => left.order - right.order)
    .map((category) => ({ ...category, goals: this.state().customGoals.filter((item) => item.categoryId === category.id).sort((left, right) => left.order - right.order) })));

  openTab(tab: PlannerTab): void {
    this.tab.set(tab);
    if (tab === 'program' && !this.activeEvent()) this.tab.set('events');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  @HostListener('document:keydown.escape')
  cancelCurrentAction(): void {
    this.endScheduleDrag();
    if (this.modal()) this.closeModal();
  }

  selectEvent(eventId: string): void {
    this.store.setActiveTrainingEvent(eventId);
    this.focusedDate.set('');
    this.visibleCourseIds.set(null);
    const firstCourse = this.state().courses.find((item) => item.trainingEventId === eventId);
    this.coverageCourseId.set(firstCourse?.id ?? '');
  }

  openEvent(event?: TrainingEvent): void {
    this.formError.set('');
    this.eventDraft = event
      ? { id: event.id, name: event.name, startDate: event.startDate, endDate: event.endDate, mainInstructor: event.mainInstructor ?? '' }
      : { ...EMPTY_EVENT, startDate: this.today(), endDate: this.today() };
    this.modal.set('event');
  }

  saveEvent(): void {
    const draft = this.eventDraft;
    if (!draft.name.trim() || !draft.startDate || !draft.endDate) return this.formError.set('Name, Startdatum und Enddatum sind Pflichtfelder.');
    if (draft.endDate < draft.startDate) return this.formError.set('Das Enddatum darf nicht vor dem Startdatum liegen.');
    const invalidCourses = draft.id ? this.eventCourses(draft.id).filter((course) => !courseWithinEvent(course, draft)) : [];
    if (invalidCourses.length) return this.formError.set(`Zeitraum zuerst bei folgenden Kursen anpassen: ${invalidCourses.map((course) => course.name).join(', ')}.`);
    if (draft.id) this.store.updateTrainingEvent(draft.id, { name: draft.name.trim(), startDate: draft.startDate, endDate: draft.endDate, mainInstructor: draft.mainInstructor.trim() });
    else this.store.createTrainingEvent({ name: draft.name.trim(), startDate: draft.startDate, endDate: draft.endDate, mainInstructor: draft.mainInstructor.trim() });
    this.closeModal();
    this.notify(draft.id ? 'Kursveranstaltung aktualisiert.' : 'Kursveranstaltung erstellt.');
  }

  deleteEvent(event: TrainingEvent): void {
    const courseIds = new Set(this.state().courses.filter((item) => item.trainingEventId === event.id).map((item) => item.id));
    const placements = this.state().placements.filter((item) => courseIds.has(item.courseId)).length;
    if (!window.confirm(`«${event.name}» mit ${courseIds.size} Kursen und ${placements} Einplanungen löschen? Die globalen Lektionen bleiben erhalten.`)) return;
    this.store.deleteTrainingEvent(event.id);
    this.notify('Kursveranstaltung gelöscht.');
  }

  openCourse(course?: Course): void {
    const event = this.activeEvent();
    if (!event) return;
    this.formError.set('');
    this.courseDraft = course
      ? { id: course.id, name: course.name, startDate: course.startDate, endDate: course.endDate, location: course.location, frameworkId: course.frameworkId ?? '' }
      : { ...EMPTY_COURSE, startDate: event.startDate, endDate: event.endDate };
    this.modal.set('course');
  }

  saveCourse(): void {
    const event = this.activeEvent();
    const draft = this.courseDraft;
    if (!event || !draft.name.trim() || !draft.startDate || !draft.endDate) return this.formError.set('Name, Startdatum und Enddatum sind Pflichtfelder.');
    if (draft.endDate < draft.startDate) return this.formError.set('Das Enddatum darf nicht vor dem Startdatum liegen.');
    if (!courseWithinEvent(draft, event)) return this.formError.set(`Der Kurs muss zwischen ${this.dateLabel(event.startDate)} und ${this.dateLabel(event.endDate)} liegen.`);
    const invalidPlacements = draft.id ? this.state().placements.filter((item) => item.courseId === draft.id && (item.date < draft.startDate || item.date > draft.endDate)) : [];
    if (invalidPlacements.length) return this.formError.set(`${invalidPlacements.length} Einplanungen liegen ausserhalb des neuen Kurszeitraums.`);
    const patch = { name: draft.name.trim(), startDate: draft.startDate, endDate: draft.endDate, location: draft.location.trim(), frameworkId: draft.frameworkId || undefined };
    if (draft.id) this.store.updateCourse(draft.id, patch);
    else this.store.createCourse({ ...patch, trainingEventId: event.id });
    this.closeModal();
    this.notify(draft.id ? 'Kurs aktualisiert.' : 'Kurs erstellt.');
  }

  deleteCourse(course: Course): void {
    const placements = this.state().placements.filter((item) => item.courseId === course.id).length;
    if (!window.confirm(`Kurs «${course.name}» löschen? ${placements} Einplanungen werden entfernt; die Lektionen bleiben in der Bibliothek.`)) return;
    this.store.deleteCourse(course.id);
    this.notify('Kurs gelöscht.');
  }

  openLesson(lesson?: Lesson): void {
    this.formError.set('');
    this.lessonDraft = lesson ? {
      id: lesson.id,
      category: lesson.category,
      number: lesson.number,
      title: lesson.title,
      summary: lesson.summary,
      durationMinutes: lesson.durationMinutes,
      participantDocuments: lesson.participantDocuments,
      instructorDocuments: lesson.instructorDocuments,
      teachingReferences: lesson.teachingReferences,
      material: lesson.material,
      steps: structuredClone(lesson.steps).sort((left, right) => left.order - right.order),
      goalKeys: lesson.goals.map(goalReferenceKey)
    } : structuredClone(EMPTY_LESSON);
    this.modal.set('lesson');
  }

  saveLesson(): void {
    const draft = this.lessonDraft;
    if (!draft.title.trim()) return this.formError.set('Der Titel ist ein Pflichtfeld.');
    if (!Number.isFinite(Number(draft.durationMinutes)) || Number(draft.durationMinutes) <= 0) return this.formError.set('Die Dauer muss grösser als 0 sein.');
    const affected = draft.id ? this.state().placements.filter((item) => item.lessonId === draft.id).length : 0;
    const oldDuration = draft.id ? this.state().lessons.find((item) => item.id === draft.id)?.durationMinutes : undefined;
    if (affected > 1 && oldDuration !== Number(draft.durationMinutes)
      && !window.confirm(`Die Dauer ändert sich in ${affected} Einplanungen. Änderung überall übernehmen?`)) return;
    const lesson = this.store.saveLesson({
      ...draft,
      title: draft.title.trim(),
      number: draft.number.trim(),
      durationMinutes: Number(draft.durationMinutes),
      steps: draft.steps.map((step, order) => ({ ...step, durationMinutes: Number(step.durationMinutes) || 0, order })),
      goals: draft.goalKeys.map((key) => this.referenceFromKey(key)).filter((item): item is GoalReference => !!item)
    });
    this.detailLessonId.set(lesson.id);
    this.closeModal();
    this.notify(draft.id ? 'Lektion überall aktualisiert.' : 'Lektion erstellt.');
  }

  deleteLesson(lesson: Lesson): void {
    const placements = this.state().placements.filter((item) => item.lessonId === lesson.id);
    const courses = [...new Set(placements.map((item) => this.course(item.courseId)?.name).filter(Boolean))];
    const message = placements.length
      ? `«${lesson.title}» ist ${placements.length}-mal eingeplant (${courses.join(', ')}). Lektion überall löschen?`
      : `«${lesson.title}» löschen?`;
    if (!window.confirm(message)) return;
    this.store.deleteLesson(lesson.id);
    this.notify('Lektion gelöscht.');
  }

  duplicateLibraryLesson(lesson: Lesson): void {
    const copy = this.store.duplicateLesson(lesson.id).lesson;
    this.openLesson(copy);
    this.notify('Unabhängige Kopie erstellt.');
  }

  addStep(): void {
    this.lessonDraft.steps.push({ id: uid('step'), arivaPhase: 'A', title: '', description: '', durationMinutes: 15, order: this.lessonDraft.steps.length });
  }

  removeStep(index: number): void {
    this.lessonDraft.steps.splice(index, 1);
  }

  moveStep(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.lessonDraft.steps.length) return;
    const [step] = this.lessonDraft.steps.splice(index, 1);
    this.lessonDraft.steps.splice(target, 0, step);
  }

  stepTotal(): number { return lessonStepTotal(this.lessonDraft); }

  toggleGoal(key: string): void {
    this.lessonDraft.goalKeys = this.lessonDraft.goalKeys.includes(key)
      ? this.lessonDraft.goalKeys.filter((item) => item !== key)
      : [...this.lessonDraft.goalKeys, key];
  }

  goalMatches(code: string, text: string): boolean {
    const query = this.goalSearch().trim().toLocaleLowerCase('de-CH');
    return !query || `${code} ${text}`.toLocaleLowerCase('de-CH').includes(query);
  }

  openPlacement(lessonId: string, placement?: LessonPlacement): void {
    const event = this.activeEvent();
    const firstCourse = placement ? this.course(placement.courseId) : this.activeCourses()[0];
    if (!event || !firstCourse) return this.notify('Lege zuerst einen Kurs an.');
    this.formError.set('');
    this.placementDraft = placement
      ? { id: placement.id, lessonId: placement.lessonId, courseId: placement.courseId, date: placement.date, startTime: placement.startTime, location: placement.location }
      : { lessonId, courseId: firstCourse.id, date: placementWithinCourse(this.focusedDate(), firstCourse) ? this.focusedDate() : firstCourse.startDate, startTime: '08:00', location: firstCourse.location };
    this.modal.set('placement');
  }

  savePlacement(): void {
    const draft = this.placementDraft;
    const course = this.course(draft.courseId);
    if (!draft.lessonId || !course || !draft.date || !draft.startTime) return this.formError.set('Kurs, Datum und Startzeit sind Pflichtfelder.');
    const input = { lessonId: draft.lessonId, courseId: draft.courseId, date: draft.date, startTime: draft.startTime, location: draft.location.trim() };
    try {
      if (draft.id) this.store.updatePlacement(draft.id, { courseId: draft.courseId, date: draft.date, startTime: draft.startTime, location: input.location });
      else this.store.createPlacement(input);
    } catch (error) {
      this.formError.set(error instanceof Error ? error.message : 'Einplanung konnte nicht gespeichert werden.');
      return;
    }
    this.closeModal();
    this.notify(draft.id ? 'Einplanung verschoben.' : 'Lektion eingeplant.');
  }

  placementCourseChanged(): void {
    const course = this.course(this.placementDraft.courseId);
    if (!course) return;
    this.placementDraft.location = course.location;
    if (this.placementDraft.date < course.startDate || this.placementDraft.date > course.endDate) this.placementDraft.date = course.startDate;
  }

  placementMinDate(): string { return this.course(this.placementDraft.courseId)?.startDate ?? ''; }
  placementMaxDate(): string { return this.course(this.placementDraft.courseId)?.endDate ?? ''; }

  openPlacementActions(placement: LessonPlacement, event?: MouseEvent): void {
    event?.preventDefault();
    this.actionPlacementId.set(placement.id);
    this.modal.set('actions');
  }

  actionEditLesson(): void {
    const placement = this.activeActionPlacement();
    const lesson = placement ? this.lesson(placement.lessonId) : undefined;
    if (lesson) this.openLesson(lesson);
  }

  actionDuplicate(): void {
    const placement = this.activeActionPlacement();
    if (!placement) return;
    const copy = this.store.duplicateLesson(placement.lessonId, placement.id).lesson;
    this.openLesson(copy);
    this.notify('Lektion und Einplanung unabhängig dupliziert.');
  }

  actionUseAgain(): void {
    const placement = this.activeActionPlacement();
    if (!placement) return;
    this.closeModal();
    this.openPlacement(placement.lessonId);
  }

  actionMove(): void {
    const placement = this.activeActionPlacement();
    if (!placement) return;
    this.closeModal();
    this.openPlacement(placement.lessonId, placement);
  }

  actionRemove(): void {
    const placement = this.activeActionPlacement();
    if (!placement || !window.confirm('Nur diese Einplanung entfernen? Die Lektion bleibt in der Bibliothek.')) return;
    this.store.removePlacement(placement.id);
    this.closeModal();
    this.notify('Einplanung entfernt.');
  }

  actionDeleteEverywhere(): void {
    const placement = this.activeActionPlacement();
    const lesson = placement ? this.lesson(placement.lessonId) : undefined;
    if (!lesson) return;
    this.closeModal();
    this.deleteLesson(lesson);
  }

  startLessonDrag(event: DragEvent, lessonId: string): void {
    this.setDrag(event, 'lesson', lessonId, 0);
  }

  startPlacementDrag(event: DragEvent, placementId: string): void {
    const card = event.currentTarget as HTMLElement;
    const offset = Math.max(0, event.clientY - card.getBoundingClientRect().top);
    this.setDrag(event, 'placement', placementId, offset);
  }

  endScheduleDrag(): void {
    this.drag = null;
    this.dropTarget.set(null);
  }

  canDropOnDate(course: Course, date: string): boolean {
    return placementWithinCourse(date, course);
  }

  previewDrop(event: DragEvent, course: Course, date: string): void {
    const target = this.scheduleDropTarget(event, course, date);
    this.dropTarget.set(target);
    if (!target) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = this.drag?.type === 'placement' ? 'move' : 'copy';
  }

  leaveDropTrack(event: DragEvent): void {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !(event.currentTarget as HTMLElement).contains(next)) this.dropTarget.set(null);
  }

  dropOnTrack(event: DragEvent, course: Course, date: string): void {
    const drag = this.drag;
    const target = this.scheduleDropTarget(event, course, date);
    this.endScheduleDrag();
    if (!drag || !target) return;
    event.preventDefault();
    try {
      const { courseId, startTime } = target;
      if (drag.type === 'placement') {
        const placement = this.state().placements.find((item) => item.id === drag.id);
        const oldCourse = placement && this.course(placement.courseId);
        const location = oldCourse?.id !== courseId && placement?.location === oldCourse?.location
          ? course.location : placement?.location;
        this.store.updatePlacement(drag.id, { courseId, date, startTime, location: location ?? '' });
        this.notify('Einplanung verschoben.');
      } else {
        this.store.createPlacement({ lessonId: drag.id, courseId, date, startTime, location: course.location });
        this.notify('Lektion eingeplant.');
      }
    } catch (error) {
      this.notify(error instanceof Error ? error.message : 'Einplanung konnte nicht gespeichert werden.');
    }
  }

  private scheduleDropTarget(event: DragEvent, course: Course, date: string) {
    if (!this.drag || !event.dataTransfer?.types.includes(SCHEDULE_DRAG_TYPE) || !this.canDropOnDate(course, date)) return null;
    const track = event.currentTarget as HTMLElement;
    const offset = event.clientY - track.getBoundingClientRect().top - this.drag.offset;
    const start = this.timelineStartHour() * 60;
    const latest = Math.min(24, this.timelineEndHour()) * 60 - 15;
    const minutes = Math.max(start, Math.min(latest, snapToQuarter(offset / PIXELS_PER_MINUTE + start)));
    return { courseId: course.id, date, startTime: timeFromMinutes(minutes), top: (minutes - start) * PIXELS_PER_MINUTE };
  }

  columnPlacements(courseId: string, date: string): LessonPlacement[] {
    return this.state().placements.filter((item) => item.courseId === courseId && item.date === date);
  }

  placementStyle(placement: LessonPlacement, column: LessonPlacement[]): Record<string, string> {
    const lesson = this.lesson(placement.lessonId);
    const lanes = assignPlacementLanes(column, this.state().lessons);
    const lane = lanes.find((item) => item.placementId === placement.id) ?? { lane: 0, laneCount: 1 };
    const top = (minutesFromTime(placement.startTime) - this.timelineStartHour() * 60) * 0.8;
    const height = Math.max(38, (lesson?.durationMinutes ?? 15) * 0.8);
    const width = 100 / lane.laneCount;
    return { top: `${top}px`, height: `${height}px`, left: `${lane.lane * width}%`, width: `calc(${width}% - 4px)` };
  }

  printPlacementStyle(placement: LessonPlacement, column: LessonPlacement[]): Record<string, string> {
    const lesson = this.lesson(placement.lessonId);
    const lanes = assignPlacementLanes(column, this.state().lessons);
    const lane = lanes.find((item) => item.placementId === placement.id) ?? { lane: 0, laneCount: 1 };
    const range = Math.max(60, (this.timelineEndHour() - this.timelineStartHour()) * 60);
    const top = ((minutesFromTime(placement.startTime) - this.timelineStartHour() * 60) / range) * 100;
    const height = Math.max(1.3, ((lesson?.durationMinutes ?? 15) / range) * 100);
    const width = 100 / lane.laneCount;
    return { top: `${top}%`, height: `${height}%`, left: `${lane.lane * width}%`, width: `${width}%` };
  }

  printGridColumns(): string {
    return `10mm repeat(${Math.max(1, this.printCourses().length * this.eventDates().length)}, minmax(0, 1fr))`;
  }

  courseFilterLabel(): string {
    const selected = this.visibleCourseIds();
    if (selected === null || selected.length === this.activeCourses().length) return 'Alle Kurse';
    if (!selected.length) return 'Keine Kurse';
    const names = this.programCourses().map((item) => item.name);
    return names.length <= 2 ? names.join(', ') : `${names.length} Kurse`;
  }

  isCourseVisible(courseId: string): boolean {
    const selected = this.visibleCourseIds();
    return selected === null || selected.includes(courseId);
  }

  toggleCourseVisibility(courseId: string): void {
    const selected = this.visibleCourseIds() ?? this.activeCourses().map((item) => item.id);
    this.visibleCourseIds.set(selected.includes(courseId) ? selected.filter((id) => id !== courseId) : [...selected, courseId]);
  }

  showAllCourses(): void { this.visibleCourseIds.set(null); }
  hideAllCourses(): void { this.visibleCourseIds.set([]); }

  placementCount(lessonId: string): number { return this.state().placements.filter((item) => item.lessonId === lessonId).length; }
  lessonPlacements(lessonId: string): LessonPlacement[] {
    return this.state().placements
      .filter((item) => item.lessonId === lessonId)
      .sort((left, right) => `${left.date} ${left.startTime}`.localeCompare(`${right.date} ${right.startTime}`));
  }
  removePlacementFromLesson(placement: LessonPlacement, lesson: Lesson): void {
    const course = this.course(placement.courseId);
    if (!window.confirm(`Einplanung von «${lesson.title}» in ${course?.name ?? 'diesem Kurs'} am ${this.dateLabel(placement.date)} entfernen?`)) return;
    this.store.removePlacement(placement.id);
    this.notify('Einplanung entfernt; die Lektion bleibt erhalten.');
  }
  lesson(lessonId: string): Lesson | undefined { return this.state().lessons.find((item) => item.id === lessonId); }
  course(courseId: string): Course | undefined { return this.state().courses.find((item) => item.id === courseId); }
  eventCourses(eventId: string): Course[] { return this.state().courses.filter((item) => item.trainingEventId === eventId); }
  eventPlacementCount(eventId: string): number {
    const courseIds = new Set(this.eventCourses(eventId).map((item) => item.id));
    return this.state().placements.filter((item) => courseIds.has(item.courseId)).length;
  }
  coursePlacementCount(courseId: string): number { return this.state().placements.filter((item) => item.courseId === courseId).length; }
  lessonCode = lessonCode;
  goalReferenceKey = goalReferenceKey;
  addMinutes = addMinutes;
  dateLabel = dateLabel;
  frameworkName = frameworkName;
  trainingPreview = trainingPreview;

  hourLabel(hour: number): string { return `${String(hour).padStart(2, '0')}:00`; }
  lessonCodeFor(lessonId: string): string { const item = this.lesson(lessonId); return item ? lessonCode(item) : ''; }
  lessonStepTotalValue(lesson: Lesson): number { return lessonStepTotal(lesson); }
  selectedPrintLessons(): Lesson[] {
    const ids = new Set(this.printLessonIds());
    return this.state().lessons.filter((item) => ids.has(item.id));
  }
  printCourses(): Course[] {
    return this.programCourses();
  }
  arivaLabel(phase?: LessonStep['arivaPhase']): string {
    return ({ A: 'Ausrichten', R: 'Reaktivieren', I: 'Informieren', V: 'Verarbeiten', A2: 'Auswerten', OTHER: 'Andere' } as Record<string, string>)[phase ?? ''] ?? '—';
  }
  goalKeyLabel(key: string): string {
    const reference = this.referenceFromKey(key);
    if (!reference) return key;
    const label = this.goalLabel(reference);
    return label.length > 52 ? `${label.slice(0, 52)}…` : label;
  }

  openDetail(lesson: Lesson): void {
    this.detailLessonId.set(lesson.id);
    this.modal.set('detail');
  }

  goalLabel(reference: GoalReference): string {
    if (reference.type === 'custom') {
      const goal = this.state().customGoals.find((item) => item.id === reference.goalId);
      return goal ? `${goal.code ?? ''} ${goal.text}`.trim() : 'Eigenes Ziel (gelöscht)';
    }
    const framework = this.frameworks.find((item) => item.id === reference.frameworkId);
    const goal = framework?.goals.find((item) => item.id === reference.goalId);
    return goal ? `${goal.code} ${goal.text}` : 'J+S-Ziel (gelöscht)';
  }

  saveGoalCategory(): void {
    if (!this.goalCategoryDraft.name.trim()) return this.notify('Bitte einen Kategorienamen eingeben.');
    const category = this.store.saveGoalCategory({ ...this.goalCategoryDraft, name: this.goalCategoryDraft.name.trim() });
    this.customGoalDraft.categoryId ||= category.id;
    this.goalCategoryDraft = { name: '', shortName: '', color: '#47745a' };
    this.notify('Zielkategorie erstellt.');
  }

  saveCustomGoal(): void {
    if (!this.customGoalDraft.categoryId || !this.customGoalDraft.text.trim()) return this.notify('Kategorie und Zieltext sind Pflichtfelder.');
    this.store.saveCustomGoal({ ...this.customGoalDraft, text: this.customGoalDraft.text.trim() });
    this.customGoalDraft = { ...this.customGoalDraft, code: '', text: '', note: '' };
    this.notify('Eigenes Ziel erstellt.');
  }

  deleteGoalCategory(category: CustomGoalCategory): void {
    const goalIds = new Set(this.state().customGoals.filter((item) => item.categoryId === category.id).map((item) => item.id));
    const uses = this.state().lessons.filter((lesson) => lesson.goals.some((goal) => goal.type === 'custom' && goalIds.has(goal.goalId))).length;
    if (!window.confirm(`Kategorie «${category.name}» mit ${goalIds.size} Zielen löschen? ${uses} Lektionen verwenden Ziele daraus.`)) return;
    this.store.deleteGoalCategory(category.id);
  }

  deleteCustomGoal(goal: CustomGoal): void {
    const uses = this.state().lessons.filter((lesson) => lesson.goals.some((item) => item.type === 'custom' && item.goalId === goal.id)).map((item) => item.title);
    if (!window.confirm(`Ziel löschen? Verwendet in ${uses.length ? uses.join(', ') : 'keiner Lektion'}.`)) return;
    this.store.deleteCustomGoal(goal.id);
  }

  coverageCourseChanged(): void { this.coverageOnlyMissing.set(false); }

  previewCurrentPersonalPlanner(): void {
    if (!this.personalPlanner.ready()) return;
    try {
      this.previewPersonalPlanner(this.personalPlanner.state());
    } catch (error) {
      this.personalPlannerPreview.set(null);
      this.notify(error instanceof Error ? error.message : 'Die Trainings konnten nicht gelesen werden.');
    }
  }

  private previewPersonalPlanner(input: unknown): void {
    const parsed = validatePersonalPlanner(input);
    this.personalPlannerPreview.set(parsed);
    this.selectedImportIds.set(parsed.trainings.map((item) => item.id));
    this.importAsCopy.set(false);
    this.notify(parsed.trainings.length ? `${parsed.trainings.length} Kursveranstaltungen geprüft.` : 'Keine Trainings im Personalplaner gefunden.');
  }

  async readPersonalPlanner(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      this.previewPersonalPlanner(JSON.parse(await file.text()));
    } catch (error) {
      this.personalPlannerPreview.set(null);
      this.notify(error instanceof Error ? error.message : 'Datei konnte nicht gelesen werden.');
    }
    (event.target as HTMLInputElement).value = '';
  }

  toggleImportTraining(trainingId: string): void {
    this.selectedImportIds.update((ids) => ids.includes(trainingId) ? ids.filter((id) => id !== trainingId) : [...ids, trainingId]);
  }

  runPersonalPlannerImport(): void {
    const file = this.personalPlannerPreview();
    if (!file || !this.selectedImportIds().length) return;
    try {
      const result = this.store.importPersonalPlanner(file, this.selectedImportIds(), this.importAsCopy());
      this.personalPlannerPreview.set(null);
      this.notify(`Veranstaltungen: ${result.createdEvents} neu, ${result.updatedEvents} aktualisiert. Kurse: ${result.createdCourses} neu, ${result.updatedCourses} aktualisiert.`);
      this.openTab('events');
    } catch (error) {
      this.notify(error instanceof Error ? error.message : 'Import fehlgeschlagen.');
    }
  }

  exportBackup(): void {
    const name = `trailbox-kursprogramm-${this.today()}.json`;
    this.download(name, JSON.stringify({ ...this.state(), exportedAt: new Date().toISOString() }, null, 2), 'application/json');
    this.notify('Vollständige Sicherung exportiert.');
  }

  async importBackup(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      if (this.backupMode() === 'replace' && !window.confirm('Alle vorhandenen Kursplaner-Daten durch diese Sicherung ersetzen?')) return;
      this.store.restore(parsed, this.backupMode());
      this.notify(this.backupMode() === 'replace' ? 'Sicherung vollständig wiederhergestellt.' : 'Sicherung zusammengeführt.');
    } catch (error) {
      this.notify(error instanceof Error ? error.message : 'Sicherung konnte nicht importiert werden.');
    }
    (event.target as HTMLInputElement).value = '';
  }

  clearData(): void {
    if (!window.confirm('Alle Kursplaner-Daten auf diesem Gerät löschen? Exportiere vorher eine Sicherung.')) return;
    this.store.clear();
    this.notify('Lokale Kursplaner-Daten gelöscht.');
  }

  printProgram(): void {
    this.printMode.set('program');
    setTimeout(() => { window.print(); this.printMode.set(null); }, 50);
  }

  toggleLessonPrint(lessonId: string): void {
    this.selectedLessonPrintIds.update((ids) => ids.includes(lessonId) ? ids.filter((id) => id !== lessonId) : [...ids, lessonId]);
  }

  printSelectedLessons(): void {
    if (!this.selectedLessonPrintIds().length) return this.notify('Wähle mindestens eine Lektion aus.');
    this.printLessonIds.set(this.selectedLessonPrintIds());
    this.printMode.set('lesson');
    setTimeout(() => { window.print(); this.printMode.set(null); }, 50);
  }

  printLesson(lesson: Lesson): void {
    this.printLessonIds.set([lesson.id]);
    this.printMode.set('lesson');
    setTimeout(() => { window.print(); this.printMode.set(null); }, 50);
  }

  closeModal(): void {
    this.modal.set(null);
    this.formError.set('');
  }

  private setDrag(event: DragEvent, type: 'lesson' | 'placement', id: string, offset: number): void {
    if (!event.dataTransfer) return;
    this.drag = { type, id, offset };
    event.dataTransfer.setData(SCHEDULE_DRAG_TYPE, id);
    event.dataTransfer.effectAllowed = type === 'placement' ? 'move' : 'copy';
  }

  private referenceFromKey(key: string): GoalReference | null {
    if (key.startsWith('custom:')) return { type: 'custom', goalId: key.slice(7) };
    if (!key.startsWith('js:')) return null;
    const raw = key.slice(3);
    const framework = this.frameworks.find((item) => raw.startsWith(`${item.id}:`));
    return framework ? { type: 'js', frameworkId: framework.id, goalId: raw.slice(framework.id.length + 1) } : null;
  }

  private notify(message: string): void {
    this.toast.set(message);
    setTimeout(() => this.toast.set(''), 3600);
  }

  private today(): string {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private download(filename: string, content: string, type: string): void {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }
}

