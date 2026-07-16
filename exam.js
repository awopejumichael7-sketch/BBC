/* ==========================================================================
   EXAM.JS — Secure timed exam with anti-cheat measures
   ========================================================================== */
import { guardRoute } from "./auth.js";
import {
  db, COL, collection, doc, getDoc, getDocs, addDoc, query, where,
  serverTimestamp
} from "./firebase-config.js";
import { toast } from "./app-shell.js";

const params = new URLSearchParams(window.location.search);
const courseId = params.get("course");

let user, profile, course, questions = [], answers = {}, timer, secondsLeft, exitCount = 0;
const EXAM_DURATION_SECONDS = 30 * 60; // 30 minutes
const MAX_EXITS = 2;

guardRoute("student").then(async (u) => {
  user = u;
  const pSnap = await getDoc(doc(db, COL.students, u.uid));
  profile = pSnap.data();
  const cSnap = await getDoc(doc(db, COL.courses, courseId));
  course = { id: courseId, ...cSnap.data() };
  document.querySelector(".brand-text strong").textContent = `Exam — ${course.title}`;
});

document.getElementById("begin-btn").onclick = async () => {
  await loadQuestions();
  if (!questions.length) { toast("No exam questions are available for this course yet.", "error"); return; }
  enterFullscreen();
};

document.getElementById("resume-btn").onclick = () => enterFullscreen();

async function loadQuestions() {
  const snap = await getDocs(query(collection(db, COL.examQuestions), where("courseId", "==", courseId)));
  const all = [];
  snap.forEach(d => all.push({ id: d.id, ...d.data() }));
  // Randomize question order and option order
  questions = shuffle(all).map(q => {
    if (q.type === "objective" && q.options) {
      const entries = shuffle(Object.entries(q.options).filter(([, v]) => v));
      return { ...q, shuffledOptions: entries };
    }
    return q;
  });
}
function shuffle(arr) { return arr.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(v => v[1]); }

function enterFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen;
  if (req) req.call(el).catch(() => toast("Fullscreen was blocked — please allow it to continue.", "error"));
  document.getElementById("warning-overlay").style.display = "none";
  document.getElementById("intro-card").style.display = "none";
  document.getElementById("exam-timer").style.display = "block";
  renderQuestions();
  startTimer();
}

function startTimer() {
  secondsLeft = EXAM_DURATION_SECONDS;
  updateTimerDisplay();
  timer = setInterval(() => {
    secondsLeft--;
    updateTimerDisplay();
    if (secondsLeft <= 0) { clearInterval(timer); submitExam(true); }
  }, 1000);
}
function updateTimerDisplay() {
  const m = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const s = String(secondsLeft % 60).padStart(2, "0");
  document.getElementById("exam-timer").textContent = `${m}:${s}`;
}

function renderQuestions() {
  const area = document.getElementById("question-area");
  area.innerHTML = "";
  questions.forEach((q, i) => {
    const card = document.createElement("div");
    card.className = "exam-q";
    if (q.type === "objective") {
      card.innerHTML = `<p><strong>Q${i + 1}.</strong> ${q.question}</p>` +
        q.shuffledOptions.map(([key, val]) => `
          <label style="display:block;margin:6px 0;cursor:pointer;">
            <input type="radio" name="q${i}" value="${key}"> ${val}
          </label>`).join("");
      card.querySelectorAll("input").forEach(inp => inp.onchange = () => answers[q.id] = { value: inp.value, correct: q.correct, type: "objective" });
    } else {
      card.innerHTML = `<p><strong>Q${i + 1}.</strong> ${q.question}</p><textarea rows="4" style="width:100%;padding:10px;border-radius:10px;border:1px solid #d8dde8;"></textarea>`;
      card.querySelector("textarea").oninput = (e) => answers[q.id] = { value: e.target.value, type: "theory" };
    }
    area.appendChild(card);
  });
  const submitBtn = document.createElement("button");
  submitBtn.className = "btn-gold"; submitBtn.style.marginTop = "10px";
  submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Submit Exam`;
  submitBtn.onclick = () => { if (confirm("Submit your exam now? This cannot be undone.")) submitExam(false); };
  area.appendChild(submitBtn);
}

/* ---------- Fullscreen exit detection -> warning -> auto-submit ---------- */
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement && timer) {
    exitCount++;
    if (exitCount > MAX_EXITS) { submitExam(true, "Auto-submitted: exited fullscreen too many times."); return; }
    document.getElementById("warning-overlay").style.display = "flex";
    document.getElementById("warning-text").textContent = `You exited fullscreen (${exitCount}/${MAX_EXITS}). Return now or your exam will auto-submit.`;
  }
});

/* ---------- Prevent copy / right-click / devtools shortcuts during exam ---------- */
document.addEventListener("contextmenu", (e) => { if (timer) e.preventDefault(); });
document.addEventListener("copy", (e) => { if (timer) e.preventDefault(); });
document.addEventListener("keydown", (e) => {
  if (!timer) return;
  const blocked = (e.key === "F12") || (e.ctrlKey && e.shiftKey && ["I", "J", "C"].includes(e.key)) || (e.ctrlKey && e.key === "u") || (e.ctrlKey && e.key === "p");
  if (blocked) { e.preventDefault(); toast("This action is disabled during the exam.", "error"); }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && timer) toast("Tab-switch detected and logged.", "error");
});

/* ---------- Grading & submission ---------- */
async function submitExam(auto, reason) {
  if (!timer) return; // already submitted
  clearInterval(timer); timer = null;
  if (document.fullscreenElement) document.exitFullscreen?.();
  document.getElementById("warning-overlay").style.display = "none";

  let score = 0, total = 0, needsManualGrading = false;
  questions.forEach(q => {
    if (q.type === "objective") {
      total += 1;
      const a = answers[q.id];
      if (a && a.value === q.correct) score += 1;
    } else {
      needsManualGrading = true;
    }
  });
  const percent = total ? Math.round((score / total) * 100) : 0;
  const grade = percent >= 70 ? "A" : percent >= 60 ? "B" : percent >= 50 ? "C" : percent >= 40 ? "D" : "F";

  await addDoc(collection(db, COL.results), {
    studentUid: user.uid, studentId: profile.studentId, courseId, courseTitle: course.title,
    score, total, percent, grade,
    needsManualGrading, autoSubmitted: !!auto, reason: reason || "",
    theoryAnswers: Object.entries(answers).filter(([, v]) => v.type === "theory").map(([qid, v]) => ({ qid, text: v.value })),
    date: new Date().toLocaleDateString(), createdAt: serverTimestamp()
  });

  document.getElementById("exam-shell").innerHTML = `
    <div class="glass-card" style="text-align:center;">
      <h3><i class="fa-solid fa-circle-check" style="color:var(--success);"></i> Exam Submitted</h3>
      <p>${auto ? (reason || "Your exam was automatically submitted.") : "Thank you — your answers have been recorded."}</p>
      ${total ? `<p>Objective score: <strong>${score}/${total} (${percent}%)</strong> — Grade ${grade}</p>` : ""}
      ${needsManualGrading ? `<p style="color:var(--muted);">Theory answers will be graded by your teacher.</p>` : ""}
      <a class="btn-navy" href="student.html"><i class="fa-solid fa-arrow-left"></i> Back to Dashboard</a>
    </div>`;
  document.getElementById("exam-timer").style.display = "none";
}
