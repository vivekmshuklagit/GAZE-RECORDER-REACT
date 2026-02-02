import React, { useEffect, useState } from "react";
import questions from "./questions.json";

export default function QuestionScreen({ onAnswer, questionsData, title, onRestart, disableOptionDelay }) {
  const defaultOptionDelayMs = 3000;
  const questionList = Array.isArray(questionsData) ? questionsData : questions;

  // Guard: if import failed or empty array
  if (!Array.isArray(questionList) || questionList.length === 0) {
    return (
      <div style={{ color: "white", padding: 24 }}>
        Questions not loaded. Check <code>src/questions.json</code> for valid JSON.
      </div>
    );
  }

  const [idx, setIdx] = useState(0);
  const [responses, setResponses] = useState({});
  const [showOptions, setShowOptions] = useState(false);

  const q = questionList[idx];
  if (!q) {
    return (
      <div style={{ color: "white", padding: 24 }}>
        Invalid question index. idx={idx}
      </div>
    );
  }

  const canBack = idx > 0;
  const canNext = questionList.length > 0;
  const isTextResponse = q?.responseType === "text";
  const textValue = typeof responses[q.id] === "string" ? responses[q.id] : "";

  function onSelect(optionIndex) {
    setResponses((r) => ({ ...r, [q.id]: optionIndex }));
    if (typeof onAnswer === "function") {
      const optionText = Array.isArray(q.options) ? q.options[optionIndex] : "";
      onAnswer(q.id, optionIndex, optionText);
    }
  }

  function onTextChange(e) {
    setResponses((r) => ({ ...r, [q.id]: e.target.value }));
  }

  function handleNext() {
    if (isTextResponse && typeof onAnswer === "function" && textValue.trim()) {
      onAnswer(q.id, null, "", textValue.trim());
    }
    const isLast = idx === questionList.length - 1;
    if (isLast && typeof onRestart === "function") onRestart();
    setIdx((i) => (i + 1) % questionList.length);
  }

  useEffect(() => {
    if (disableOptionDelay) {
      setShowOptions(true);
      return undefined;
    }
    setShowOptions(false);
    const delayMs = Number.isFinite(q?.optionDelayMs) ? q.optionDelayMs : defaultOptionDelayMs;
    const timer = setTimeout(() => setShowOptions(true), Math.max(0, delayMs));
    return () => clearTimeout(timer);
  }, [idx, q?.optionDelayMs, disableOptionDelay]);

  useEffect(() => {
    setIdx(0);
    setResponses({});
  }, [questionList]);

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ color: "#aaa", marginBottom: 8 }}>
        {title ? `${title} — ` : ""}Question {idx + 1} / {questionList.length}
      </div>

      <h2
        data-content-id={`question_${q.id}`}
        data-content-type="question_prompt"
        style={{ color: "#fff", lineHeight: 1.4 }}
      >
        {q.prompt}
      </h2>

      {isTextResponse && (
        <div style={{ marginTop: 16 }}>
          {!showOptions && (
            <div style={{ color: "#bbb", fontSize: 13 }}>Response box will appear shortly...</div>
          )}
          {showOptions && (
            <textarea
              rows={4}
              value={textValue}
              onChange={onTextChange}
              data-content-id={`response_${q.id}`}
              data-content-type="question_text_response"
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.08)",
                color: "#fff",
                resize: "vertical",
              }}
              placeholder="Type your response..."
            />
          )}
        </div>
      )}

      {!isTextResponse && q.showOptions && Array.isArray(q.options) && (
        <div style={{ marginTop: 16 }}>
          {!showOptions && (
            <div style={{ color: "#bbb", fontSize: 13 }}>Options will appear shortly...</div>
          )}
          {showOptions &&
            q.options.map((opt, i) => {
              const selected = responses[q.id] === i;
              return (
                <button
                  key={i}
                  onClick={() => onSelect(i)}
                  data-content-id={`option_${q.id}_${i}`}
                  data-content-type="question_option"
                  style={{
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "12px 14px",
                    marginTop: 10,
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: selected
                      ? "rgba(255,255,255,0.18)"
                      : "rgba(255,255,255,0.08)",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  {opt}
                </button>
              );
            })}
        </div>
      )}


      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={!canBack}
          data-content-id="btn_back"
          data-content-type="nav_button"
          style={navBtnStyle(!canBack)}
        >
          Back
        </button>

        <button
          onClick={handleNext}
          disabled={!canNext}
          data-content-id="btn_next"
          data-content-type="nav_button"
          style={navBtnStyle(!canNext)}
        >
          {idx === questionList.length - 1 ? "Restart" : "Next"}
        </button>

        <button
          onClick={() => {
            console.log("responses:", responses);
            alert("Responses captured (see console).");
          }}
          data-content-id="btn_submit"
          data-content-type="nav_button"
          style={navBtnStyle(false)}
        >
          Submit
        </button>
      </div>
    </div>
  );
}

function navBtnStyle(disabled) {
  return {
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.18)",
    background: disabled ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.10)",
    color: disabled ? "rgba(255,255,255,0.4)" : "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
  };
}
