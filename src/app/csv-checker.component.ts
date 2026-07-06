import { ChangeDetectionStrategy, Component, Inject, signal } from '@angular/core';
import { APP_SETTINGS, AppSettings } from './app-settings';
import { ValidationResult, validateCsv } from './csv-validator';

@Component({
  selector: 'app-csv-checker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './csv-checker.component.html',
  styleUrl: './csv-checker.component.scss'
})
export class CsvCheckerComponent {
  readonly fileName = signal('');
  readonly result = signal<ValidationResult | null>(null);
  readonly reading = signal(false);
  readonly fileError = signal('');
  readonly dragging = signal(false);

  constructor(@Inject(APP_SETTINGS) readonly settings: AppSettings) {}

  onDrag(event: DragEvent, over: boolean): void {
    event.preventDefault();
    this.dragging.set(over);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files.item(0);
    if (file) void this.check(file);
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0);
    if (file) void this.check(file);
    input.value = '';
  }

  reset(): void {
    this.fileName.set('');
    this.result.set(null);
    this.fileError.set('');
  }

  private async check(file: File): Promise<void> {
    this.reset();
    this.fileName.set(file.name);
    if (!file.name.toLowerCase().endsWith('.csv')) {
      this.fileError.set('Bitte eine Datei mit der Endung .csv auswählen.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.fileError.set('Die Datei ist grösser als 5 MB.');
      return;
    }

    this.reading.set(true);
    try {
      const bytes = await file.arrayBuffer();
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      this.result.set(validateCsv(text, this.settings.importChecker));
    } catch {
      this.fileError.set('Die Datei konnte nicht als UTF-8 gelesen werden.');
    } finally {
      this.reading.set(false);
    }
  }
}
