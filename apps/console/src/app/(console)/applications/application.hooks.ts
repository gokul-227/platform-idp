"use client";

import { toastError } from "@aec-craft/ui/lib/toast";
import { useMutation } from "@tanstack/react-query";
import { deleteApplication, updateApplication } from "./actions";

/**
 * The Hydra writes as hooks, shaped like the SDK's. The update answers Hydra's
 * own validation message, which the form shows beside its fields, so it throws
 * rather than toasts; the delete has no form and toasts.
 */

export function useDeleteApplication() {
  return useMutation({
    mutationFn: deleteApplication,
    onError: (error) => toastError(error),
  });
}

export function useUpdateApplication() {
  return useMutation({
    mutationFn: async (formData: FormData) => {
      const result = await updateApplication(formData);
      if (result.error) {
        throw new Error(result.error);
      }
    },
  });
}
