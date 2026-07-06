import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { APP_SETTINGS, AppSettings } from './app/app-settings';

async function start(): Promise<void> {
  const response = await fetch('app-settings.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('app-settings.json konnte nicht geladen werden.');
  const settings = await response.json() as AppSettings;
  await bootstrapApplication(AppComponent, { providers: [{ provide: APP_SETTINGS, useValue: settings }] });
}

start().catch((error: unknown) => {
  console.error(error);
  document.body.innerHTML = '<main style="font:16px system-ui;padding:3rem"><h1>Trailbox kann nicht starten.</h1><p>Bitte app-settings.json prüfen.</p></main>';
});
