"use client";

import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
  REGEXP_ONLY_DIGITS,
} from "@aec-craft/ui/components/primitives/input-otp";
import type { ReactNode } from "react";

/**
 * Six-digit entry, shared by the emailed codes and by TOTP, which differ only in
 * the field name Kratos expects. Uncontrolled unless `value`/`onChange` is passed.
 *
 * `pushPasswordManagerStrategy="none"`: the default grows the hidden input 40px
 * past the container when input-otp senses a badge, which Apple's autofill
 * triggers, and the card's `overflow-hidden` is a scroll container, so focus
 * scrolls the card sideways and the padding goes with it. Off, a badge overlaps
 * the last slot instead.
 */
export function OtpField({
  name,
  value,
  onChange,
}: {
  name: string;
  value?: string;
  onChange?: (value: string) => void;
}): ReactNode {
  return (
    <InputOTP
      autoFocus
      containerClassName="justify-center"
      maxLength={6}
      name={name}
      onChange={onChange}
      pattern={REGEXP_ONLY_DIGITS}
      pushPasswordManagerStrategy="none"
      required
      value={value}
    >
      <InputOTPGroup>
        <InputOTPSlot index={0} />
        <InputOTPSlot index={1} />
        <InputOTPSlot index={2} />
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        <InputOTPSlot index={3} />
        <InputOTPSlot index={4} />
        <InputOTPSlot index={5} />
      </InputOTPGroup>
    </InputOTP>
  );
}
