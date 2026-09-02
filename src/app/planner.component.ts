import { ChangeDetectionStrategy, Component, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AbsenceStatus,
  Gender,
  GENDERS,
  ImportRow,
  MealPeriod,
  PERIODS,
  Period,
  PersonDraft,
  PlannerPerson,
  PLANNER_ROLES,
  PlannerRole,
  Training
} from './planner.models';
import { PlannerStore } from './planner-store.service';
import {
  absenceOverlaps,
  csvEscape,
  datesBetween,
  defaultPresence,
  downloadText,
  effectivePeriod,
  localDateLabel,
  normalizedName,
  parsePlannerCsv,
  plannedPresence,
  visibleTrainingDates
} from './planner-utils';

type PlannerTab = 'dashboard' | 'matrix' | 'people' | 'settings' | 'report';
type SortDirection = 'asc' | 'desc';
type MatrixSortKey = 'firstName' | 'lastName' | 'role' | 'subTraining';
type PeopleSortKey = MatrixSortKey | 'gender' | 'origin' | 'expert';

interface SortState<T extends string> {
  key: T;
  direction: SortDirection;
}

interface TrainingDraft {
  name: string;
  startDate: string;
  endDate: string;
  mainInstructor: string;
}

interface AbsenceDraft {
  personId: string;
  departureAt: string;
  returnAt: string;
  reason: string;
  status: AbsenceStatus;
  decision: string;
}

const EMPTY_PERSON: PersonDraft = {
  firstName: '', lastName: '', gender: 'Keine Angabe', role: 'Teilnehmer', subTrainingId: null, external: false, expert: false
};

@Component({
  selector: 'app-planner',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './planner.component.html',
  styleUrl: './planner.component.scss'
})
export class PlannerComponent {
  readonly roles = PLANNER_ROLES;
  readonly genders = GENDERS;
  readonly periods = PERIODS;
  readonly periodLabels: Record<Period, { short: string; long: string }> = {
    morning: { short: 'VM', long: 'Vormittag' },
    lunch: { short: 'M', long: 'Mittagessen' },
    afternoon: { short: 'NM', long: 'Nachmittag' },
    dinner: { short: 'A', long: 'Abendessen' },
    overnight: { short: 'Ü', long: 'Übernachtung' }
  };

  readonly activeTrainingId = signal('');
  readonly creatingTraining = signal(false);
  readonly tab = signal<PlannerTab>('dashboard');
  readonly activeTraining = computed(() => this.store.state().trainings.find((item) => item.id === this.activeTrainingId()) ?? null);
  readonly dates = computed(() => this.activeTraining() ? visibleTrainingDates(this.activeTraining()!) : []);
  readonly activePeople = computed(() => this.activeTraining()?.people.filter((person) => !person.archived) ?? []);
  readonly filteredPeople = computed(() => {
    const query = this.search().trim().toLocaleLowerCase('de-CH');
    const role = this.roleFilter();
    const course = this.courseFilter();
    return this.activePeople().filter((person) => {
      const name = `${person.firstName} ${person.lastName}`.toLocaleLowerCase('de-CH');
      return (!query || name.includes(query)) && (!role || person.role === role) && (!course || person.subTrainingId === course);
    });
  });
  readonly visiblePeriods = computed(() => this.periods.filter((period) => {
    if ((period === 'morning' || period === 'afternoon') && !this.showDaytimes()) return false;
    if ((period === 'lunch' || period === 'dinner') && !this.showMeals()) return false;
    return period !== 'overnight' || this.showOvernight();
  }));
  readonly sortedFilteredPeople = computed(() => this.sortPeople(this.filteredPeople(), this.matrixSort()));
  readonly sortedPeople = computed(() => this.sortPeople(this.activePeople(), this.peopleSort()));
  readonly participants = computed(() => this.activePeople().filter((person) => person.role === 'Teilnehmer'));
  readonly experts = computed(() => this.activePeople().filter((person) => person.expert && this.canBeExpert(person.role)));
  readonly totalNights = computed(() => this.dates().reduce((total, date) => total + this.count(date, 'overnight'), 0));

  readonly search = signal('');
  readonly roleFilter = signal<PlannerRole | ''>('');
  readonly courseFilter = signal('');
  readonly showMeals = signal(true);
  readonly showDaytimes = signal(true);
  readonly showOvernight = signal(true);
  readonly matrixSort = signal<SortState<MatrixSortKey>>({ key: 'lastName', direction: 'asc' });
  readonly peopleSort = signal<SortState<PeopleSortKey>>({ key: 'lastName', direction: 'asc' });
  readonly personEditorOpen = signal(false);
  readonly editingPersonId = signal('');
  readonly absenceEditorOpen = signal(false);
  readonly importOpen = signal(false);
  readonly importRows = signal<ImportRow[]>([]);
  readonly importFileName = signal('');
  readonly notice = signal('');
  readonly error = signal('');

  personDraft: PersonDraft = { ...EMPTY_PERSON };
  trainingDraft: TrainingDraft = this.defaultTrainingDraft();
  absenceDraft: AbsenceDraft = { personId: '', departureAt: '', returnAt: '', reason: '', status: 'pending', decision: '' };
  subTrainingName = '';
  subTrainingInstructors = '';

  constructor(readonly store: PlannerStore) {
    effect(() => {
      const trainings = this.store.state().trainings;
      if (!this.creatingTraining() && !trainings.some((item) => item.id === this.activeTrainingId())) {
        this.activeTrainingId.set(trainings[0]?.id ?? '');
        if (trainings[0]) this.loadTrainingDraft(trainings[0]);
      }
    });
  }

  selectTraining(trainingId: string): void {
    this.creatingTraining.set(false);
    this.activeTrainingId.set(trainingId);
    const training = this.store.state().trainings.find((item) => item.id === trainingId);
    if (training) this.loadTrainingDraft(training);
    this.tab.set('dashboard');
  }

  createTraining(): void {
    this.clearMessages();
    if (!this.trainingDraft.name.trim() || !this.trainingDraft.startDate || !this.trainingDraft.endDate) {
      this.error.set('Name, Startdatum und Enddatum sind erforderlich.');
      return;
    }
    if (this.trainingDraft.startDate > this.trainingDraft.endDate) {
      this.error.set('Das Enddatum darf nicht vor dem Startdatum liegen.');
      return;
    }
    const training = this.store.createTraining({ ...this.trainingDraft, name: this.trainingDraft.name.trim() });
    this.creatingTraining.set(false);
    this.activeTrainingId.set(training.id);
    this.loadTrainingDraft(training);
    this.notice.set('Training wurde erstellt. Füge jetzt die Unterkurse hinzu.');
    this.tab.set('settings');
  }

  saveTraining(): void {
    const training = this.activeTraining();
    if (!training) return;
    this.clearMessages();
    if (!this.trainingDraft.name.trim() || this.trainingDraft.startDate > this.trainingDraft.endDate) {
      this.error.set('Bitte prüfe Name und Datumsbereich.');
      return;
    }
    this.store.updateTraining(training.id, { ...this.trainingDraft, name: this.trainingDraft.name.trim() });
    this.notice.set('Trainingseinstellungen gespeichert.');
  }

  deleteTraining(): void {
    const training = this.activeTraining();
    if (!training || !confirm(`«${training.name}» inklusive aller Planungsdaten löschen?`)) return;
    this.store.deleteTraining(training.id);
    this.creatingTraining.set(false);
    this.trainingDraft = this.defaultTrainingDraft();
    this.tab.set('dashboard');
  }

  addSubTraining(): void {
    const training = this.activeTraining();
    const name = this.subTrainingName.trim();
    if (!training || !name) return;
    if (training.subTrainings.some((item) => item.name.toLocaleLowerCase('de-CH') === name.toLocaleLowerCase('de-CH'))) {
      this.error.set('Dieser Unterkurs existiert bereits.');
      return;
    }
    this.store.addSubTraining(training.id, name, this.subTrainingInstructors.split(','));
    this.subTrainingName = '';
    this.subTrainingInstructors = '';
  }

  updateSubTraining(id: string, name: string, instructors: string): void {
    const training = this.activeTraining();
    if (!training || !name.trim()) return;
    this.store.updateSubTraining(training.id, id, { name: name.trim(), instructors: instructors.split(',') });
  }

  deleteSubTraining(id: string): void {
    const training = this.activeTraining();
    if (!training || !confirm('Unterkurs entfernen? Zugewiesene Personen bleiben erhalten, aber ohne Unterkurs.')) return;
    this.store.deleteSubTraining(training.id, id);
  }

  openPerson(person?: PlannerPerson): void {
    this.clearMessages();
    this.editingPersonId.set(person?.id ?? '');
    this.personDraft = person ? {
      firstName: person.firstName,
      lastName: person.lastName,
      gender: person.gender,
      role: person.role,
      subTrainingId: person.subTrainingId,
      external: person.external,
      expert: !!person.expert && this.canBeExpert(person.role)
    } : { ...EMPTY_PERSON };
    this.personEditorOpen.set(true);
  }

  savePerson(): void {
    const training = this.activeTraining();
    if (!training) return;
    const draft = {
      ...this.personDraft,
      firstName: this.personDraft.firstName.trim(),
      lastName: this.personDraft.lastName.trim(),
      expert: this.canBeExpert(this.personDraft.role) && !!this.personDraft.expert
    };
    if (!draft.firstName || !draft.lastName) {
      this.error.set('Vorname und Name sind erforderlich.');
      return;
    }
    const key = normalizedName(draft.firstName, draft.lastName);
    const duplicate = training.people.some((person) => !person.archived && person.id !== this.editingPersonId() && normalizedName(person.firstName, person.lastName) === key);
    if (duplicate) {
      this.error.set('Eine Person mit diesem Vor- und Nachnamen existiert bereits.');
      return;
    }
    if (this.editingPersonId()) this.store.updatePerson(training.id, this.editingPersonId(), draft);
    else this.store.addPerson(training.id, draft);
    this.personEditorOpen.set(false);
    this.notice.set('Person gespeichert.');
  }

  archivePerson(person: PlannerPerson): void {
    const training = this.activeTraining();
    if (!training || !confirm(`${person.firstName} ${person.lastName} archivieren?`)) return;
    this.store.archivePerson(training.id, person.id);
  }

  toggle(person: PlannerPerson, date: string, period: Period): void {
    const training = this.activeTraining();
    if (!training || this.hasApprovedAbsence(person, date, period)) return;
    const current = plannedPresence(training, person, date);
    const next = { ...current, [period]: !current[period], mealOverrides: { ...(current.mealOverrides ?? {}) } };
    if (period === 'lunch' || period === 'dinner') next.mealOverrides[period] = true;
    this.store.setPresence(training.id, person.id, date, next);
  }

  presence(person: PlannerPerson, date: string, period: Period): boolean {
    const training = this.activeTraining();
    return !!training && effectivePeriod(training, person, date, period);
  }

  isMealOverride(person: PlannerPerson, date: string, period: Period): boolean {
    if (period !== 'lunch' && period !== 'dinner') return false;
    const training = this.activeTraining();
    return !!training && !!plannedPresence(training, person, date).mealOverrides?.[period];
  }

  hasApprovedAbsence(person: PlannerPerson, date: string, period: Period): boolean {
    const training = this.activeTraining();
    return !!training?.absences.some((absence) => absence.personId === person.id && absence.status === 'approved' && absenceOverlaps(absence.departureAt, absence.returnAt, date, period));
  }

  openAbsence(person?: PlannerPerson): void {
    this.clearMessages();
    this.absenceDraft = this.emptyAbsence(person?.id);
    this.absenceEditorOpen.set(true);
  }

  saveAbsence(): void {
    const training = this.activeTraining();
    const draft = this.absenceDraft;
    if (!training || !draft.personId || !draft.departureAt || !draft.returnAt || !draft.reason.trim()) {
      this.error.set('Person, Abreise, Rückkehr und Grund sind erforderlich.');
      return;
    }
    if (draft.departureAt >= draft.returnAt) {
      this.error.set('Die Rückkehr muss nach der Abreise liegen.');
      return;
    }
    const overlaps = training.absences.some((absence) => absence.personId === draft.personId && absence.status !== 'rejected' && draft.status !== 'rejected'
      && draft.departureAt < absence.returnAt && draft.returnAt > absence.departureAt);
    if (overlaps) {
      this.error.set('Für diese Person existiert bereits eine überlappende Absenz.');
      return;
    }
    this.store.addAbsence(training.id, { ...draft, reason: draft.reason.trim(), decision: draft.decision.trim() });
    this.absenceEditorOpen.set(false);
    this.notice.set('Absenz gespeichert.');
  }

  updateAbsenceStatus(absenceId: string, status: AbsenceStatus): void {
    const training = this.activeTraining();
    if (training) this.store.updateAbsence(training.id, absenceId, { status });
  }

  updateAbsenceDecision(absenceId: string, decision: string): void {
    const training = this.activeTraining();
    if (training) this.store.updateAbsence(training.id, absenceId, { decision });
  }

  deleteAbsence(absenceId: string): void {
    const training = this.activeTraining();
    if (training && confirm('Absenz löschen?')) this.store.deleteAbsence(training.id, absenceId);
  }

  personName(personId: string): string {
    const person = this.activeTraining()?.people.find((item) => item.id === personId);
    return person ? `${person.firstName} ${person.lastName}` : 'Unbekannte Person';
  }

  subTrainingNameFor(person: PlannerPerson): string {
    return this.activeTraining()?.subTrainings.find((item) => item.id === person.subTrainingId)?.name ?? '–';
  }

  setMatrixSort(key: MatrixSortKey): void {
    this.matrixSort.update((current) => nextSort(current, key));
  }

  setPeopleSort(key: PeopleSortKey): void {
    this.peopleSort.update((current) => nextSort(current, key));
  }

  sortLabel<T extends string>(state: SortState<T>, key: T): string {
    if (state.key !== key) return '↕';
    return state.direction === 'asc' ? '↑' : '↓';
  }

  canBeExpert(role: PlannerRole): boolean {
    return role !== 'Teilnehmer' && role !== 'Gast';
  }

  dateLabel(value: string): string {
    return localDateLabel(value);
  }

  count(date: string, period: Period, people = this.activePeople()): number {
    const training = this.activeTraining();
    return training ? people.filter((person) => effectivePeriod(training, person, date, period)).length : 0;
  }

  expertAvailability(date: string): PlannerPerson[] {
    return this.experts().filter((person) => this.presence(person, date, 'morning') || this.presence(person, date, 'afternoon'));
  }

  expertNames(date: string): string {
    return this.expertAvailability(date).map((person) => `${person.firstName} ${person.lastName}`).join(', ');
  }

  genderCount(date: string, period: Period, gender: Gender): number {
    return this.count(date, period, this.activePeople().filter((person) => person.gender === gender));
  }

  periodTotal(period: Period): number {
    return this.dates().reduce((total, date) => total + this.count(date, period), 0);
  }

  genderTotal(period: Period, gender: Gender): number {
    return this.dates().reduce((total, date) => total + this.genderCount(date, period, gender), 0);
  }

  fullyAbsent(date: string): number {
    return this.activePeople().filter((person) => !this.presence(person, date, 'morning') && !this.presence(person, date, 'afternoon')).length;
  }

  participantBreakdown(): Array<{ course: string; gender: Gender; count: number }> {
    const training = this.activeTraining();
    if (!training) return [];
    const rows: Array<{ course: string; gender: Gender; count: number }> = [];
    const courses = [...training.subTrainings.map((course) => ({ id: course.id, name: course.name })), { id: null, name: 'Ohne Unterkurs' }];
    for (const course of courses) for (const gender of GENDERS) {
      const count = this.participants().filter((person) => person.subTrainingId === course.id && person.gender === gender).length;
      if (count) rows.push({ course: course.name, gender, count });
    }
    return rows;
  }

  mealBreakdown(date: string, meal: MealPeriod): string {
    const training = this.activeTraining();
    if (!training) return '';
    const entries: string[] = [];
    for (const course of [...training.subTrainings.map((item) => ({ id: item.id, name: item.name })), { id: null, name: 'Ohne UK' }]) {
      for (const gender of GENDERS) {
        const people = this.activePeople().filter((person) => person.subTrainingId === course.id && person.gender === gender);
        const count = this.count(date, meal, people);
        if (count) entries.push(`${course.name} · ${genderShort(gender)} ${count}`);
      }
    }
    return entries.join('  |  ');
  }

  async readImport(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.item(0);
    const training = this.activeTraining();
    if (!file || !training) return;
    this.importFileName.set(file.name);
    this.importRows.set(parsePlannerCsv(await file.text(), training));
    (event.target as HTMLInputElement).value = '';
  }

  confirmImport(): void {
    const training = this.activeTraining();
    if (!training) return;
    const rows = this.importRows().filter((row) => row.valid);
    this.store.addPeople(training.id, rows.map(({ firstName, lastName, gender, role, subTrainingId, external, expert }) => ({ firstName, lastName, gender, role, subTrainingId, external, expert })));
    this.importOpen.set(false);
    this.importRows.set([]);
    this.notice.set(`${rows.length} Personen wurden importiert.`);
  }

  downloadTemplate(): void {
    downloadText('personen-planer-vorlage.csv', '\uFEFFfirst_name;last_name;gender;role;sub_training;external;expert\n', 'text/csv;charset=utf-8');
  }

  exportKitchen(): void {
    const training = this.activeTraining();
    if (!training) return;
    const rows = [['Datum', 'Unterkurs', 'Geschlecht', 'Mittagessen', 'Abendessen', 'Übernachtung']];
    for (const date of this.dates()) {
      const groups = [...training.subTrainings.map((item) => ({ id: item.id, name: item.name })), { id: null, name: 'Ohne Unterkurs' }];
      for (const group of groups) for (const gender of GENDERS) {
        const people = this.activePeople().filter((person) => person.subTrainingId === group.id && person.gender === gender);
        const values = [this.count(date, 'lunch', people), this.count(date, 'dinner', people), this.count(date, 'overnight', people)];
        if (values.some(Boolean)) rows.push([date, group.name, gender, ...values.map(String)]);
      }
      rows.push([date, 'TOTAL', 'Alle', String(this.count(date, 'lunch')), String(this.count(date, 'dinner')), String(this.count(date, 'overnight'))]);
    }
    downloadText(`${safeFilename(training.name)}-kueche.csv`, `\uFEFF${rows.map((row) => row.map(csvEscape).join(';')).join('\n')}`, 'text/csv;charset=utf-8');
  }

  printReport(): void {
    this.tab.set('report');
    setTimeout(() => window.print());
  }

  backup(): void {
    downloadText(`trailbox-planer-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(this.store.state(), null, 2), 'application/json');
  }

  async restore(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.item(0);
    if (!file || !confirm('Die aktuelle lokale Planung durch diese Sicherung ersetzen?')) return;
    try {
      await this.store.restore(JSON.parse(await file.text()));
      this.notice.set('Sicherung wurde wiederhergestellt.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Sicherung konnte nicht gelesen werden.');
    }
    (event.target as HTMLInputElement).value = '';
  }

  validImportCount(): number {
    return this.importRows().filter((row) => row.valid).length;
  }

  pendingAbsences(): number {
    return this.activeTraining()?.absences.filter((absence) => absence.status === 'pending').length ?? 0;
  }

  private loadTrainingDraft(training: Training): void {
    this.trainingDraft = { name: training.name, startDate: training.startDate, endDate: training.endDate, mainInstructor: training.mainInstructor };
  }

  private defaultTrainingDraft(): TrainingDraft {
    const today = new Date().toISOString().slice(0, 10);
    return { name: '', startDate: today, endDate: today, mainInstructor: '' };
  }

  private emptyAbsence(personId = ''): AbsenceDraft {
    const training = this.activeTraining();
    const date = training?.startDate ?? new Date().toISOString().slice(0, 10);
    return { personId, departureAt: `${date}T08:00`, returnAt: `${date}T18:00`, reason: '', status: 'pending', decision: '' };
  }

  private clearMessages(): void {
    this.error.set('');
    this.notice.set('');
  }

  private sortPeople<T extends MatrixSortKey | PeopleSortKey>(people: PlannerPerson[], sort: SortState<T>): PlannerPerson[] {
    return [...people].sort((left, right) => {
      const primary = compareText(this.sortValue(left, sort.key), this.sortValue(right, sort.key), sort.direction);
      if (primary) return primary;
      const byLastName = compareText(left.lastName, right.lastName, 'asc');
      if (byLastName) return byLastName;
      return compareText(left.firstName, right.firstName, 'asc');
    });
  }

  private sortValue(person: PlannerPerson, key: MatrixSortKey | PeopleSortKey): string {
    if (key === 'subTraining') return this.subTrainingNameFor(person);
    if (key === 'origin') return person.external ? 'Extern' : 'Intern';
    if (key === 'expert') return person.expert ? 'Experte' : '';
    return person[key];
  }
}

function safeFilename(value: string): string {
  return value.trim().toLocaleLowerCase('de-CH').normalize('NFKD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'training';
}

function genderShort(gender: Gender): string {
  return ({ Weiblich: 'W', Männlich: 'M', Divers: 'D', 'Keine Angabe': '–' } as const)[gender];
}

function nextSort<T extends string>(current: SortState<T>, key: T): SortState<T> {
  return { key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' };
}

function compareText(left: string, right: string, direction: SortDirection): number {
  const result = left.localeCompare(right, 'de-CH', { sensitivity: 'base', numeric: true });
  return direction === 'asc' ? result : -result;
}
