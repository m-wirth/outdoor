import { Injectable, signal } from '@angular/core';
import { Absence, COURSE_MATERIAL_OPTIONS, CourseMaterialOption, DayPresence, EMPTY_STATE, NUTRITION_PREFERENCES, NutritionPreference, PersonDraft, PlannerPerson, PlannerState, SubTraining, Training } from './planner.models';
import { id, importDuplicateKey } from './planner-utils';

const DB_NAME = 'trailbox-planner';
const STORE_NAME = 'state';
const STATE_KEY = 'planner-v1';

@Injectable({ providedIn: 'root' })
export class PlannerStore {
  readonly state = signal<PlannerState>(EMPTY_STATE);
  readonly ready = signal(false);
  readonly saving = signal(false);

  constructor() {
    void this.load();
  }

  createTraining(input: Pick<Training, 'name' | 'startDate' | 'endDate' | 'mainInstructor'>): Training {
    const now = new Date().toISOString();
    const training: Training = {
      ...input,
      id: id('training'),
      subTrainings: [],
      people: [],
      presence: {},
      absences: [],
      createdAt: now,
      updatedAt: now
    };
    this.change((state) => ({ ...state, trainings: [...state.trainings, training] }));
    return training;
  }

  updateTraining(trainingId: string, patch: Partial<Pick<Training, 'name' | 'startDate' | 'endDate' | 'mainInstructor'>>): void {
    this.updateOne(trainingId, (training) => ({ ...training, ...patch, updatedAt: new Date().toISOString() }));
  }

  deleteTraining(trainingId: string): void {
    this.change((state) => ({ ...state, trainings: state.trainings.filter((training) => training.id !== trainingId) }));
  }

  addSubTraining(trainingId: string, name: string, instructors: string[]): void {
    const subTraining: SubTraining = { id: id('course'), name: name.trim(), instructors: cleanNames(instructors) };
    this.updateOne(trainingId, (training) => ({ ...training, subTrainings: [...training.subTrainings, subTraining] }));
  }

  updateSubTraining(trainingId: string, subTrainingId: string, patch: Partial<Pick<SubTraining, 'name' | 'instructors'>>): void {
    this.updateOne(trainingId, (training) => ({
      ...training,
      subTrainings: training.subTrainings.map((item) => item.id === subTrainingId
        ? { ...item, ...patch, ...(patch.instructors ? { instructors: cleanNames(patch.instructors) } : {}) }
        : item)
    }));
  }

  deleteSubTraining(trainingId: string, subTrainingId: string): void {
    this.updateOne(trainingId, (training) => ({
      ...training,
      subTrainings: training.subTrainings.filter((item) => item.id !== subTrainingId),
      people: training.people.map((person) => person.subTrainingId === subTrainingId ? { ...person, subTrainingId: null } : person)
    }));
  }

  addPerson(trainingId: string, draft: PersonDraft): PlannerPerson {
    const person: PlannerPerson = { id: id('person'), ...normalizePersonDraft(draft), archived: false };
    this.updateOne(trainingId, (training) => ({ ...training, people: [...training.people, person] }));
    return person;
  }

  addPeople(trainingId: string, drafts: PersonDraft[]): void {
    this.updateOne(trainingId, (training) => ({
      ...training,
      people: [...training.people, ...drafts.map((draft) => ({ id: id('person'), ...normalizePersonDraft(draft), archived: false }))]
    }));
  }

  importPeople(trainingId: string, drafts: PersonDraft[]): { added: number; updated: number } {
    let result = { added: 0, updated: 0 };
    this.updateOne(trainingId, (training) => {
      const people = [...training.people];
      const peopleByImportKey = new Map<string, number>();
      people.forEach((person, index) => {
        const key = importDuplicateKey(person.firstName, person.lastName, person.birthDate);
        if (key && !peopleByImportKey.has(key)) peopleByImportKey.set(key, index);
      });
      result = drafts.reduce((counts, draft) => {
        const normalizedDraft = normalizePersonDraft(draft);
        const key = importDuplicateKey(normalizedDraft.firstName, normalizedDraft.lastName, normalizedDraft.birthDate);
        const existingIndex = peopleByImportKey.get(key);
        if (existingIndex === undefined) {
          people.push({ id: id('person'), ...normalizedDraft, archived: false });
          peopleByImportKey.set(key, people.length - 1);
          return { ...counts, added: counts.added + 1 };
        }
        const merged = mergeMissingPersonData(people[existingIndex], normalizedDraft);
        if (merged !== people[existingIndex]) {
          people[existingIndex] = merged;
          return { ...counts, updated: counts.updated + 1 };
        }
        return counts;
      }, { added: 0, updated: 0 });
      return { ...training, people };
    });
    return result;
  }

  updatePerson(trainingId: string, personId: string, draft: PersonDraft): void {
    this.updateOne(trainingId, (training) => ({
      ...training,
      people: training.people.map((person) => person.id === personId ? { ...person, ...normalizePersonDraft(draft) } : person)
    }));
  }

  archivePerson(trainingId: string, personId: string): void {
    this.updateOne(trainingId, (training) => ({
      ...training,
      people: training.people.map((person) => person.id === personId ? { ...person, archived: true } : person)
    }));
  }

  setPresence(trainingId: string, personId: string, date: string, presence: DayPresence): void {
    this.updateOne(trainingId, (training) => ({
      ...training,
      presence: {
        ...training.presence,
        [personId]: { ...(training.presence[personId] ?? {}), [date]: presence }
      }
    }));
  }

  addAbsence(trainingId: string, absence: Omit<Absence, 'id'>): void {
    this.updateOne(trainingId, (training) => ({ ...training, absences: [...training.absences, { id: id('absence'), ...absence }] }));
  }

  updateAbsence(trainingId: string, absenceId: string, patch: Partial<Omit<Absence, 'id' | 'personId'>>): void {
    this.updateOne(trainingId, (training) => ({
      ...training,
      absences: training.absences.map((absence) => absence.id === absenceId ? { ...absence, ...patch } : absence)
    }));
  }

  deleteAbsence(trainingId: string, absenceId: string): void {
    this.updateOne(trainingId, (training) => ({ ...training, absences: training.absences.filter((absence) => absence.id !== absenceId) }));
  }

  async restore(state: PlannerState): Promise<void> {
    if (state?.version !== 1 || !Array.isArray(state.trainings)) throw new Error('Die Sicherungsdatei ist ungültig.');
    this.state.set(normalizeState(structuredClone(state)));
    await this.save();
  }

  private updateOne(trainingId: string, updater: (training: Training) => Training): void {
    this.change((state) => ({
      ...state,
      trainings: state.trainings.map((training) => training.id === trainingId
        ? { ...updater(training), updatedAt: new Date().toISOString() }
        : training)
    }));
  }

  private change(updater: (state: PlannerState) => PlannerState): void {
    this.state.update((state) => updater(structuredClone(state)));
    void this.save();
  }

  private async load(): Promise<void> {
    try {
      const db = await openDb();
      const stored = await request<PlannerState | undefined>(db.transaction(STORE_NAME).objectStore(STORE_NAME).get(STATE_KEY));
      if (stored?.version === 1) this.state.set(normalizeState(stored));
      db.close();
    } finally {
      this.ready.set(true);
    }
  }

  private async save(): Promise<void> {
    this.saving.set(true);
    try {
      const db = await openDb();
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(this.state(), STATE_KEY);
      await transactionDone(transaction);
      db.close();
    } finally {
      this.saving.set(false);
    }
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const opening = indexedDB.open(DB_NAME, 1);
    opening.onupgradeneeded = () => opening.result.createObjectStore(STORE_NAME);
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

function cleanNames(names: string[]): string[] {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}

function normalizeState(state: PlannerState): PlannerState {
  return {
    ...state,
    trainings: state.trainings.map((training) => ({
      ...training,
      people: training.people.map((person) => ({
        ...person,
        expert: !!person.expert,
        birthDate: String(person.birthDate ?? ''),
        nutritionPreferences: normalizeNutritionPreferences(person.nutritionPreferences),
        medicalInformation: String(person.medicalInformation ?? ''),
        courseMaterials: normalizeCourseMaterials(person.courseMaterials),
        fieldbedRequested: !!person.fieldbedRequested
      }))
    }))
  };
}

function normalizePersonDraft(draft: PersonDraft): PersonDraft {
  const expert = draft.role !== 'Teilnehmer' && draft.role !== 'Gast' && !!draft.expert;
  return {
    ...draft,
    expert,
    birthDate: draft.birthDate.trim(),
    nutritionPreferences: normalizeNutritionPreferences(draft.nutritionPreferences),
    medicalInformation: draft.medicalInformation.trim(),
    courseMaterials: normalizeCourseMaterials(draft.courseMaterials),
    fieldbedRequested: !!draft.fieldbedRequested
  };
}

export function mergeMissingPersonData(person: PlannerPerson, draft: PersonDraft): PlannerPerson {
  const mergedNutritionPreferences = normalizeNutritionPreferences([...person.nutritionPreferences, ...draft.nutritionPreferences]);
  const merged: PlannerPerson = {
    ...person,
    birthDate: person.birthDate || draft.birthDate,
    gender: person.gender === 'Keine Angabe' && draft.gender !== 'Keine Angabe' ? draft.gender : person.gender,
    subTrainingId: person.subTrainingId ?? draft.subTrainingId,
    nutritionPreferences: mergedNutritionPreferences,
    medicalInformation: person.medicalInformation || draft.medicalInformation,
    courseMaterials: person.courseMaterials ?? draft.courseMaterials,
    fieldbedRequested: person.fieldbedRequested || draft.fieldbedRequested
  };
  return hasPersonChanged(person, merged) ? merged : person;
}

function hasPersonChanged(before: PlannerPerson, after: PlannerPerson): boolean {
  return before.birthDate !== after.birthDate
    || before.gender !== after.gender
    || before.subTrainingId !== after.subTrainingId
    || before.medicalInformation !== after.medicalInformation
    || before.courseMaterials !== after.courseMaterials
    || before.fieldbedRequested !== after.fieldbedRequested
    || before.nutritionPreferences.length !== after.nutritionPreferences.length
    || before.nutritionPreferences.some((preference, index) => preference !== after.nutritionPreferences[index]);
}

function normalizeNutritionPreferences(value: unknown): NutritionPreference[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is NutritionPreference => NUTRITION_PREFERENCES.includes(item as NutritionPreference)))];
}

function normalizeCourseMaterials(value: unknown): CourseMaterialOption | null {
  return COURSE_MATERIAL_OPTIONS.includes(value as CourseMaterialOption) ? value as CourseMaterialOption : null;
}
