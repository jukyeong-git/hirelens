"use client";

import { useActionState } from "react";

import { initialAuthActionState } from "../action-state";
import { signInAction } from "../actions";
import { visibleCopy } from "../../_components/visible-copy";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialAuthActionState);

  return (
    <form className="login-form" action={formAction}>
      <div className="section-heading">
        <p className="eyebrow">Internal workspace</p>
        <h1 id="login-title">HireLens에 로그인</h1>
        <p>채용 담당자 전용</p>
      </div>

      {state.status === "error" ? (
        <p className="form-alert form-alert-error" role="alert">
          {visibleCopy(state.message)}
        </p>
      ) : null}

      <div className="field-stack">
        <div className="field">
          <label htmlFor="email">이메일</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="field">
          <label htmlFor="password">비밀번호</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
      </div>

      <button className="button button-primary button-wide" type="submit" disabled={pending}>
        {pending ? "로그인 중…" : "로그인"}
      </button>
    </form>
  );
}
