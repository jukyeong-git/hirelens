"use client";

import { useEffect } from "react";

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isFormControl(target: EventTarget | null): target is FormControl {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement
  );
}

function fieldLabel(control: FormControl) {
  if (control.id) {
    const label = Array.from(document.querySelectorAll("label")).find(
      (candidate) => candidate.htmlFor === control.id,
    );
    if (label?.textContent?.trim()) return label.textContent.trim().replace(/\s*\([^)]*\)\s*$/u, "");
  }

  return control.getAttribute("aria-label") ?? "이 항목";
}

function validationMessage(control: FormControl) {
  const label = fieldLabel(control);
  const { validity } = control;

  if (validity.valueMissing) return `${label}을(를) 입력하세요.`;
  if (validity.typeMismatch && control instanceof HTMLInputElement && control.type === "email") {
    return "올바른 이메일 주소를 입력하세요.";
  }
  if (validity.tooLong) return `${label}은(는) 너무 깁니다.`;
  if (validity.tooShort) return `${label}은(는) 너무 짧습니다.`;
  if (validity.patternMismatch) return `${label}의 입력 형식을 확인하세요.`;
  if (validity.rangeUnderflow) return `${label}의 값이 너무 작습니다.`;
  if (validity.rangeOverflow) return `${label}의 값이 너무 큽니다.`;
  if (validity.badInput) return `${label}의 입력값을 확인하세요.`;

  return "입력값을 확인하세요.";
}

export function KoreanFormValidation() {
  useEffect(() => {
    const handleInvalid = (event: Event) => {
      if (!isFormControl(event.target)) return;
      event.target.setCustomValidity(validationMessage(event.target));
    };

    const clearMessage = (event: Event) => {
      if (!isFormControl(event.target)) return;
      event.target.setCustomValidity("");
    };

    document.addEventListener("invalid", handleInvalid, true);
    document.addEventListener("input", clearMessage, true);
    document.addEventListener("change", clearMessage, true);
    return () => {
      document.removeEventListener("invalid", handleInvalid, true);
      document.removeEventListener("input", clearMessage, true);
      document.removeEventListener("change", clearMessage, true);
    };
  }, []);

  return null;
}
