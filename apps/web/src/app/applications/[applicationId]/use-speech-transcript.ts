"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Live Korean dictation through the browser's own speech recognition.
 *
 * The Web Speech API is used rather than a hosted transcription service for two
 * reasons: it streams results as the interview happens, so the interviewer sees
 * the transcript building instead of waiting for an upload after the fact, and
 * it costs nothing per interview. Availability is a Chrome and Safari story —
 * `isSupported` is false elsewhere and the caller falls back to typing.
 *
 * Recognition sessions end on their own after a pause, so `restartingRef`
 * distinguishes a stop we asked for from one the engine performed, and
 * transparently resumes the latter. Without it, dictation dies at the first
 * silence between a question and its answer.
 */

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResultLike;
  };
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

export interface SpeechTranscriptController {
  isSupported: boolean;
  isRecording: boolean;
  /** Everything finalized so far. This is what gets sent for assessment. */
  transcript: string;
  /** The phrase currently being recognized, not yet final. */
  interim: string;
  error: string | null;
  elapsedSeconds: number;
  start: () => void;
  stop: () => void;
  reset: () => void;
  /** Lets the interviewer correct or paste over the dictated text. */
  setTranscript: (value: string) => void;
}

export function useSpeechTranscript(): SpeechTranscriptController {
  const [isSupported, setIsSupported] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const restartingRef = useRef(false);

  useEffect(() => {
    setIsSupported(getRecognitionConstructor() !== null);
  }, []);

  useEffect(() => {
    if (!isRecording) return;
    const timer = setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1_000);
    return () => clearInterval(timer);
  }, [isRecording]);

  const stop = useCallback(() => {
    restartingRef.current = false;
    setIsRecording(false);
    setInterim("");
    recognitionRef.current?.stop();
    recognitionRef.current = null;
  }, []);

  const start = useCallback(() => {
    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setError("이 브라우저는 음성 인식을 지원하지 않습니다. 직접 입력하세요.");
      return;
    }
    setError(null);
    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let finalized = "";
      let pending = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result) continue;
        if (result.isFinal) finalized += result[0].transcript;
        else pending += result[0].transcript;
      }
      if (finalized) {
        setTranscript(
          (current) =>
            `${current}${current && !current.endsWith(" ") ? " " : ""}${finalized.trim()} `,
        );
      }
      setInterim(pending);
    };

    recognition.onerror = (event) => {
      if (event.error === "no-speech" || event.error === "aborted") return;
      setError(
        event.error === "not-allowed"
          ? "마이크 사용이 차단되어 있습니다. 브라우저 주소창의 자물쇠에서 허용하세요."
          : "음성 인식이 중단되었습니다. 다시 시작하거나 직접 입력하세요.",
      );
      restartingRef.current = false;
      setIsRecording(false);
    };

    recognition.onend = () => {
      // The engine stops itself after a pause; resume unless we asked it to.
      if (restartingRef.current) {
        try {
          recognition.start();
        } catch {
          restartingRef.current = false;
          setIsRecording(false);
        }
      }
    };

    recognitionRef.current = recognition;
    restartingRef.current = true;
    try {
      recognition.start();
      setIsRecording(true);
    } catch {
      restartingRef.current = false;
      setError("음성 인식을 시작하지 못했습니다. 직접 입력하세요.");
    }
  }, []);

  const reset = useCallback(() => {
    stop();
    setTranscript("");
    setInterim("");
    setElapsedSeconds(0);
    setError(null);
  }, [stop]);

  useEffect(() => {
    return () => {
      restartingRef.current = false;
      recognitionRef.current?.abort();
    };
  }, []);

  return {
    isSupported,
    isRecording,
    transcript,
    interim,
    error,
    elapsedSeconds,
    start,
    stop,
    reset,
    setTranscript,
  };
}
