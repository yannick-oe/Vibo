/**
 * @file Session-scoped memory for an invite opened while signed out: the
 * redeem route stores the token, the login/registration completion consumes
 * it exactly once and returns to /invite/{token}. sessionStorage survives
 * the auth redirects but never leaks into other tabs or later sessions;
 * storage failures (blocked storage) degrade to the normal login flow.
 */
import { Injectable } from '@angular/core';

const STORAGE_KEY = 'pendingInviteToken';

/**
 * Consume-once handover of an invite token across the login/registration
 * flow.
 */
@Injectable({ providedIn: 'root' })
export class PendingInviteService {
  /**
   * Remembers the invite token for the sign-in that follows.
   * @param token Invite token from the redeem route.
   */
  store(token: string): void {
    try {
      sessionStorage.setItem(STORAGE_KEY, token);
    } catch {
      return;
    }
  }


  /**
   * Returns the stored token and clears it, so it redirects exactly once.
   */
  consume(): string | null {
    try {
      const token = sessionStorage.getItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
      return token;
    } catch {
      return null;
    }
  }
}
