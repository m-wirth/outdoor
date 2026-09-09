import { ChangeDetectionStrategy, Component, computed, effect, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AbsenceStatus,
  COURSE_MATERIAL_OPTIONS,
  CourseMaterialOption,
  Gender,
  GENDERS,
  ImportRow,
  MealPeriod,
  NUTRITION_PREFERENCES,
  NutritionPreference,
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
  importDuplicateKey,
  parsePlannerCsv,
  plannedPresence,
  visibleTrainingDates
} from './planner-utils';
import { downloadParticipantListXlsx } from './xlsx-export';

type PlannerTab = 'dashboard' | 'matrix' | 'people' | 'settings' | 'report';
type SortDirection = 'asc' | 'desc';
type MatrixSortKey = 'firstName' | 'lastName' | 'role' | 'subTraining';
type PeopleSortKey = MatrixSortKey | 'birthDate' | 'gender' | 'origin' | 'expert' | 'nutrition' | 'medical' | 'courseMaterials' | 'fieldbed';
type OriginFilter = '' | 'internal' | 'external';
type BooleanFilter = '' | 'yes' | 'no';

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
  firstName: '',
  lastName: '',
  birthDate: '',
  gender: 'Keine Angabe',
  role: 'Teilnehmer',
  subTrainingId: null,
  external: false,
  expert: false,
  nutritionPreferences: [],
  medicalInformation: '',
  courseMaterials: null,
  fieldbedRequested: false,
  address: '',
  streetNumber: '',
  postalCode: '',
  city: '',
  privatePhone: '',
  mobilePhone: '',
  email: '',
  rrNumber: '',
  rrStapoName: '',
  courseCode: ''
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
  readonly nutritionPreferences = NUTRITION_PREFERENCES;
  readonly courseMaterialOptions = COURSE_MATERIAL_OPTIONS;
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
    const query = normalizeFilter(this.search());
    const role = this.roleFilter();
    const course = this.courseFilter();
    const gender = this.genderFilter();
    const origin = this.originFilter();
    return this.activePeople().filter((person) => {
      const name = normalizeFilter(`${person.firstName} ${person.lastName}`);
      return (!query || name.includes(query))
        && (!role || person.role === role)
        && (!course || person.subTrainingId === course)
        && (!gender || person.gender === gender)
        && (!origin || matchesOrigin(person, origin));
    });
  });
  readonly visiblePeriods = computed(() => this.periods.filter((period) => {
    if ((period === 'morning' || period === 'afternoon') && !this.showDaytimes()) return false;
    if ((period === 'lunch' || period === 'dinner') && !this.showMeals()) return false;
    return period !== 'overnight' || this.showOvernight();
  }));
  readonly sortedFilteredPeople = computed(() => this.sortPeople(this.filteredPeople(), this.matrixSort()));
  readonly filteredTablePeople = computed(() => {
    const lastName = normalizeFilter(this.peopleLastNameFilter());
    const firstName = normalizeFilter(this.peopleFirstNameFilter());
    const birthDate = normalizeFilter(this.peopleBirthDateFilter());
    const gender = this.peopleGenderFilter();
    const role = this.peopleRoleFilter();
    const course = this.peopleCourseFilter();
    const origin = this.peopleOriginFilter();
    const expert = this.peopleExpertFilter();
    const nutrition = this.peopleNutritionFilter();
    const courseMaterials = this.peopleCourseMaterialsFilter();
    const fieldbed = this.peopleFieldbedFilter();
    const medical = normalizeFilter(this.peopleMedicalFilter());
    return this.activePeople().filter((person) => matchesText(person.lastName, lastName)
      && matchesText(person.firstName, firstName)
      && matchesText(person.birthDate, birthDate)
      && (!gender || person.gender === gender)
      && (!role || person.role === role)
      && (!course || person.subTrainingId === course)
      && (!origin || matchesOrigin(person, origin))
      && (!expert || matchesBoolean(person.expert, expert))
      && (!nutrition || person.nutritionPreferences.includes(nutrition))
      && (!courseMaterials || person.courseMaterials === courseMaterials)
      && (!fieldbed || matchesBoolean(person.fieldbedRequested, fieldbed))
      && matchesText(person.medicalInformation, medical));
  });
  readonly sortedPeople = computed(() => this.sortPeople(this.filteredTablePeople(), this.peopleSort()));
  readonly participants = computed(() => this.activePeople().filter((person) => person.role === 'Teilnehmer'));
  readonly experts = computed(() => this.activePeople().filter((person) => person.expert && this.canBeExpert(person.role)));
  readonly totalNights = computed(() => this.dates().reduce((total, date) => total + this.count(date, 'overnight'), 0));
  readonly nutritionSummary = computed(() => this.nutritionPreferences
    .map((preference) => ({ label: preference, count: this.activePeople().filter((person) => person.nutritionPreferences.includes(preference)).length }))
    .filter((row) => row.count > 0));
  readonly courseMaterialSummary = computed(() => {
    const training = this.activeTraining();
    if (!training) return [];
    const courses = [...training.subTrainings.map((course) => ({ id: course.id, name: course.name })), { id: null, name: 'Ohne Unterkurs' }];
    return courses.flatMap((course) => this.courseMaterialOptions.map((option) => ({
      course: course.name,
      option,
      count: this.participants().filter((person) => person.subTrainingId === course.id && person.courseMaterials === option).length
    }))).filter((row) => row.count > 0);
  });
  readonly fieldbedCount = computed(() => this.activePeople().filter((person) => person.fieldbedRequested).length);

  readonly search = signal('');
  readonly roleFilter = signal<PlannerRole | ''>('');
  readonly courseFilter = signal('');
  readonly genderFilter = signal<Gender | ''>('');
  readonly originFilter = signal<OriginFilter>('');
  readonly peopleLastNameFilter = signal('');
  readonly peopleFirstNameFilter = signal('');
  readonly peopleBirthDateFilter = signal('');
  readonly peopleGenderFilter = signal<Gender | ''>('');
  readonly peopleRoleFilter = signal<PlannerRole | ''>('');
  readonly peopleCourseFilter = signal('');
  readonly peopleOriginFilter = signal<OriginFilter>('');
  readonly peopleExpertFilter = signal<BooleanFilter>('');
  readonly peopleNutritionFilter = signal<NutritionPreference | ''>('');
  readonly peopleCourseMaterialsFilter = signal<CourseMaterialOption | ''>('');
  readonly peopleFieldbedFilter = signal<BooleanFilter>('');
  readonly peopleMedicalFilter = signal('');
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
      birthDate: person.birthDate,
      gender: person.gender,
      role: person.role,
      subTrainingId: person.subTrainingId,
      external: person.external,
      expert: !!person.expert && this.canBeExpert(person.role),
      nutritionPreferences: [...person.nutritionPreferences],
      medicalInformation: person.medicalInformation,
      courseMaterials: person.courseMaterials,
      fieldbedRequested: person.fieldbedRequested,
      address: person.address,
      streetNumber: person.streetNumber,
      postalCode: person.postalCode,
      city: person.city,
      privatePhone: person.privatePhone,
      mobilePhone: person.mobilePhone,
      email: person.email,
      rrNumber: person.rrNumber,
      rrStapoName: person.rrStapoName,
      courseCode: person.courseCode
    } : { ...EMPTY_PERSON, nutritionPreferences: [] };
    this.personEditorOpen.set(true);
  }

  savePerson(): void {
    const training = this.activeTraining();
    if (!training) return;
    const draft = {
      ...this.personDraft,
      firstName: this.personDraft.firstName.trim(),
      lastName: this.personDraft.lastName.trim(),
      birthDate: this.personDraft.birthDate.trim(),
      expert: this.canBeExpert(this.personDraft.role) && !!this.personDraft.expert,
      nutritionPreferences: [...new Set(this.personDraft.nutritionPreferences)],
      medicalInformation: this.personDraft.medicalInformation.trim(),
      fieldbedRequested: !!this.personDraft.fieldbedRequested,
      address: this.personDraft.address.trim(),
      streetNumber: this.personDraft.streetNumber.trim(),
      postalCode: this.personDraft.postalCode.trim(),
      city: this.personDraft.city.trim(),
      privatePhone: this.personDraft.privatePhone.trim(),
      mobilePhone: this.personDraft.mobilePhone.trim(),
      email: this.personDraft.email.trim(),
      rrNumber: this.personDraft.rrNumber.trim(),
      rrStapoName: this.personDraft.rrStapoName.trim(),
      courseCode: this.personDraft.courseCode.trim()
    };
    if (!draft.firstName || !draft.lastName) {
      this.error.set('Vorname und Name sind erforderlich.');
      return;
    }
    const key = importDuplicateKey(draft.firstName, draft.lastName, draft.birthDate);
    const duplicate = training.people.some((person) => !person.archived && person.id !== this.editingPersonId() && importDuplicateKey(person.firstName, person.lastName, person.birthDate) === key);
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

  resetMatrixFilters(): void {
    this.search.set('');
    this.roleFilter.set('');
    this.courseFilter.set('');
    this.genderFilter.set('');
    this.originFilter.set('');
  }

  resetPeopleFilters(): void {
    this.peopleLastNameFilter.set('');
    this.peopleFirstNameFilter.set('');
    this.peopleBirthDateFilter.set('');
    this.peopleGenderFilter.set('');
    this.peopleRoleFilter.set('');
    this.peopleCourseFilter.set('');
    this.peopleOriginFilter.set('');
    this.peopleExpertFilter.set('');
    this.peopleNutritionFilter.set('');
    this.peopleCourseMaterialsFilter.set('');
    this.peopleFieldbedFilter.set('');
    this.peopleMedicalFilter.set('');
  }

  sortLabel<T extends string>(state: SortState<T>, key: T): string {
    if (state.key !== key) return '↕';
    return state.direction === 'asc' ? '↑' : '↓';
  }

  canBeExpert(role: PlannerRole): boolean {
    return role !== 'Teilnehmer' && role !== 'Gast';
  }

  hasNutritionPreference(preference: NutritionPreference): boolean {
    return this.personDraft.nutritionPreferences.includes(preference);
  }

  setNutritionPreference(preference: NutritionPreference, checked: boolean): void {
    const values = new Set(this.personDraft.nutritionPreferences);
    if (checked) values.add(preference);
    else values.delete(preference);
    this.personDraft = { ...this.personDraft, nutritionPreferences: [...values] };
  }

  nutritionLabel(person: PlannerPerson): string {
    return person.nutritionPreferences.length ? person.nutritionPreferences.join(', ') : '–';
  }

  courseMaterialLabel(person: PlannerPerson): string {
    return courseMaterialShortLabel(person.courseMaterials);
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
    const result = this.store.importPeople(training.id, rows.map(({ firstName, lastName, birthDate, gender, role, subTrainingId, external, expert, nutritionPreferences, medicalInformation, courseMaterials, fieldbedRequested, address, streetNumber, postalCode, city, privatePhone, mobilePhone, email, rrNumber, rrStapoName, courseCode }) => ({
      firstName,
      lastName,
      birthDate,
      gender,
      role,
      subTrainingId,
      external,
      expert,
      nutritionPreferences,
      medicalInformation,
      courseMaterials,
      fieldbedRequested,
      address,
      streetNumber,
      postalCode,
      city,
      privatePhone,
      mobilePhone,
      email,
      rrNumber,
      rrStapoName,
      courseCode
    })));
    this.importOpen.set(false);
    this.importRows.set([]);
    this.notice.set(`${result.added} Personen wurden importiert, ${result.updated} bestehende Personen ergänzt.`);
  }

  downloadTemplate(): void {
    downloadText('personen-planer-vorlage.csv', '\uFEFFfirst_name;last_name;birth_date;gender;role;sub_training;external;expert;essgewohnheiten;medizinische_informationen;kursunterlagen;feldbett;adresse;nr;plz;wohnort;tel_p;handy;mail;rr_nr;rr_stapo_name;kurs_kuerzel\n', 'text/csv;charset=utf-8');
  }

  exportParticipantList(): void {
    const training = this.activeTraining();
    if (!training) return;
    downloadParticipantListXlsx(training);
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
    rows.push([]);
    rows.push(['Essgewohnheiten', 'Personen']);
    for (const row of this.nutritionSummary()) rows.push([row.label, String(row.count)]);
    if (!this.nutritionSummary().length) rows.push(['Keine erfasst', '0']);
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
    if (key === 'nutrition') return this.nutritionLabel(person);
    if (key === 'medical') return person.medicalInformation;
    if (key === 'courseMaterials') return person.courseMaterials ?? '';
    if (key === 'fieldbed') return person.fieldbedRequested ? 'Ja' : 'Nein';
    return person[key];
  }
}

function courseMaterialShortLabel(option: CourseMaterialOption | null): string {
  if (option === 'Digital ohne Ordner') return 'digital';
  if (option === 'Neuer Ordner') return 'neuer Ordner';
  if (option === 'Ordner aus früherem Kurs') return 'alter Ordner';
  return '–';
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

function normalizeFilter(value: string): string {
  return value.trim().toLocaleLowerCase('de-CH').normalize('NFKD').replace(/\p{Diacritic}/gu, '');
}

function matchesText(value: string, filter: string): boolean {
  return !filter || normalizeFilter(value).includes(filter);
}

function matchesOrigin(person: PlannerPerson, filter: OriginFilter): boolean {
  if (!filter) return true;
  return filter === 'external' ? person.external : !person.external;
}

function matchesBoolean(value: boolean, filter: BooleanFilter): boolean {
  if (!filter) return true;
  return filter === 'yes' ? value : !value;
}

function compareText(left: string, right: string, direction: SortDirection): number {
  const result = left.localeCompare(right, 'de-CH', { sensitivity: 'base', numeric: true });
  return direction === 'asc' ? result : -result;
}
