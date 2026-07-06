import { Inject, Injectable } from '@angular/core';
import { APP_SETTINGS, AppSettings } from './app-settings';

const SESSION_KEY = 'trailbox-unlocked-until';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(@Inject(APP_SETTINGS) private readonly settings: AppSettings) {}

  isUnlocked(): boolean {
    return Number(sessionStorage.getItem(SESSION_KEY) ?? 0) > Date.now();
  }

  async unlock(password: string): Promise<boolean> {
    const hash = await this.hash(`${this.settings.passwordSalt}:${password}`);
    if (!this.constantTimeEqual(hash, this.settings.passwordHash.toLowerCase())) return false;

    const lifetime = Math.max(0.25, this.settings.sessionHours) * 60 * 60 * 1000;
    sessionStorage.setItem(SESSION_KEY, String(Date.now() + lifetime));
    return true;
  }

  lock(): void {
    sessionStorage.removeItem(SESSION_KEY);
  }

  private async hash(value: string): Promise<string> {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  private constantTimeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index++) {
      difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
  }
}
