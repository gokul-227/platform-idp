"use client";

import { toastError } from "@aec-craft/ui/lib/toast";
import { useMutation } from "@tanstack/react-query";
import type { Authority } from "@/lib/authority";
import {
  createIdentity,
  deleteIdentity,
  updateConsoleAccess,
  updateIdentityState,
} from "./actions";

/**
 * The Kratos writes as hooks, shaped like the SDK's: the server action is the
 * mutation, a failure is a toast, and the action's own `revalidatePath` refreshes
 * what changed. Where to go afterwards is the caller's, passed to `mutate`.
 */

export function useCreateIdentity() {
  return useMutation({
    mutationFn: createIdentity,
    onError: (error) => toastError(error),
  });
}

export function useDeleteIdentity() {
  return useMutation({
    mutationFn: deleteIdentity,
    onError: (error) => toastError(error),
  });
}

export function useUpdateIdentityState() {
  return useMutation({
    mutationFn: (vars: { id: string; state: "active" | "inactive" }) =>
      updateIdentityState(vars.id, vars.state),
    onError: (error) => toastError(error),
  });
}

export function useUpdateConsoleAccess() {
  return useMutation({
    mutationFn: (vars: { id: string; next: Authority | null }) =>
      updateConsoleAccess(vars.id, vars.next),
    onError: (error) => toastError(error),
  });
}
