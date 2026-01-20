import React, { useState } from "react";
import questions from "./questions.json";

export default function QuestionScreen() {
  // Guard: if import failed or empty array
  if (!Array.isArray(questions) || questions.length === 0) {
    return (
      <div style={{ color: "white", padding: 24 }}>
        Questions not loaded. Check <code>src/questions.json</code> for valid JSON.
      </div>
    );
  }

  const [idx, setIdx] = useState(0);
  const [responses, setResponses] = useState({});

  const q = questions[idx];
  if (!q) {
    return (
      <div style={{ color: "white", padding: 24 }}>
        Invalid question index. idx={idx}
      </div>
    );
  }

  const canBack = idx > 0;
  const canNext = questions.length > 0;

  function onSelect(optionIndex) {
    setResponses((r) => ({ ...r, [q.id]: optionIndex }));
  }

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <div style={{ color: "#aaa", marginBottom: 8 }}>
        Question {idx + 1} / {questions.length}
      </div>

      <h2
        data-content-id={`question_${q.id}`}
        data-content-type="question_prompt"
        style={{ color: "#fff", lineHeight: 1.4 }}
      >
        {q.prompt}
      </h2>

      {q.showOptions && Array.isArray(q.options) && (
  <div style={{ marginTop: 16 }}>
    {q.options.map((opt, i) => {
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
          onClick={() => setIdx((i) => (i + 1) % questions.length)}
          disabled={!canNext}
          data-content-id="btn_next"
          data-content-type="nav_button"
          style={navBtnStyle(!canNext)}
        >
          {idx === questions.length - 1 ? "Restart" : "Next"}
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
