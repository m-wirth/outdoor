import { InjectionToken } from '@angular/core';

export interface AppSettings {
  appName: string;
  passwordSalt: string;
  passwordHash: string;
  sessionHours: number;
  importChecker: {
    maxRows: number;
    requireIdentifier: boolean;
  };
}

export const APP_SETTINGS = new InjectionToken<AppSettings>('app.settings');
