/**
 * Auth form state.
 *
 * This lives outside `src/lib/auth/actions.ts` because a `"use server"` module
 * may only export async functions — a plain exported object is a build error.
 */

export interface AuthState {
  error: string | null;
  notice: string | null;
  /** Which role the submitted form declared, so the UI can keep the 3D pose. */
  role: string | null;
}

export const EMPTY_AUTH_STATE: AuthState = {
  error: null,
  notice: null,
  role: null,
};
