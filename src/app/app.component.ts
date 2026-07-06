import { ChangeDetectionStrategy, Component, Inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { APP_SETTINGS, AppSettings } from './app-settings';
import { AuthService } from './auth.service';
import { CsvCheckerComponent } from './csv-checker.component';

type View = 'dashboard' | 'checker';

@Component({
  selector: 'app-root',
  imports: [FormsModule, CsvCheckerComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  readonly unlocked = signal(false);
  readonly view = signal<View>('dashboard');
  readonly loginError = signal('');
  readonly loggingIn = signal(false);
  password = '';

  constructor(
    readonly auth: AuthService,
    @Inject(APP_SETTINGS) readonly settings: AppSettings
  ) {
    this.unlocked.set(this.auth.isUnlocked());
  }

  async login(): Promise<void> {
    if (!this.password || this.loggingIn()) return;
    this.loggingIn.set(true);
    this.loginError.set('');
    const accepted = await this.auth.unlock(this.password);
    this.password = '';
    this.loggingIn.set(false);
    if (accepted) this.unlocked.set(true);
    else this.loginError.set('Das Passwort stimmt nicht. Versuch es nochmals.');
  }

  open(view: View): void {
    this.view.set(view);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  logout(): void {
    this.auth.lock();
    this.view.set('dashboard');
    this.unlocked.set(false);
  }
}
