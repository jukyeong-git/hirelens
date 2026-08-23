"use client";

import { useActionState } from "react";

import { initialAuthActionState } from "../action-state";
import { signInAction } from "../actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signInAction, initialAuthActionState);

  return (
    <form className="login-form" action={formAction}>
      <div className="section-heading">
        <p className="eyebrow">Demo access</p>
        <h1 id="login-title">HireLens에 로그인</h1>
        <p>합성 Demo 계정으로 Job 작업 공간에 접근합니다.</p>
      </div>

      {state.status === "error" ? (
        <p className="form-alert form-alert-error" role="alert">
          {state.message}
        </p>
      ) : null}

      <div className="field-stack">
        <div className="field">
          <label htmlFor="email">이메일</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue="recruiter@demo.hirelens.example"
            required
          />
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
