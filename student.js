/* ==========================================================================
   STUDENT.JS — Student Dashboard
   ========================================================================== */
import { guardRoute, logout } from "./auth.js";
import {
  db, COL, collection, doc, getDoc, getDocs, addDoc, query, where,
  serverTimestamp, logActivity
} from "./firebase-config.js";
import { toast, initTheme, toggleTheme, registerServiceWorker, protectElement, queueOfflineAction, initOfflineWatcher } from "./app-shell.js";

initTheme();
registerServiceWorker();
const main = document.getElementById("main-content");
document.getElementById("theme-btn").onclick = toggleTheme;
document.getElementById("logout-btn").onclick = logout;

let user, profile, course;

guardRoute("student").then(async (u) => {
  user = u;
  const snap = await getDoc(doc(db, COL.students, u.uid));
  profile = snap.data();
  if (profile.courseId) {
    const cSnap = await getDoc(doc(db, COL.courses, profile.courseId));
    course = { id: profile.courseId, ...cSnap.data() };
  }
  bindSidebar();
  renderOverview();
  markAttendance();
  initOfflineWatcher({
    attendance: async (payload) => { await addDoc(collection(db, COL.attendance), payload); }
  });
});

function bindSidebar() {
  document.querySelectorAll(".sidebar a").forEach(a => {
    a.addEventListener("click", () => {
      document.querySelectorAll(".sidebar a").forEach(x => x.classList.remove("active"));
      a.classList.add("active");
      ({
        overview: renderOverview, library: renderLibrary, media: renderMedia,
        exams: renderExams, certificates: renderCertificates,
        questions: renderQuestions, feedback: renderFeedback
      })[a.dataset.view]();
    });
  });
}

/* ---------- Auto attendance on login (works offline via queue) ---------- */
async function markAttendance() {
  if (!course) return;
  const now = new Date();
  const payload = {
    studentId: profile.studentId, courseId: course.id,
    date: now.toISOString().slice(0, 10), time: now.toLocaleTimeString(),
    device: navigator.userAgent, browser: navigator.userAgentData?.brands?.[0]?.brand || "Browser",
    createdAt: new Date().toISOString()
  };
  if (navigator.onLine) {
    try { await addDoc(collection(db, COL.attendance), payload); } catch (e) { queueOfflineAction({ type: "attendance", payload }); }
  } else {
    queueOfflineAction({ type: "attendance", payload });
  }
}

function renderOverview() {
  main.innerHTML = `
    <h2>Welcome, ${profile.fullName}</h2>
    <p style="color:var(--muted);">Enrolled course: <strong>${course ? course.code + " — " + course.title : "Not enrolled yet"}</strong></p>
    <div class="stat-grid">
      <div class="stat-card"><div class="num"><i class="fa-solid fa-id-card"></i></div><div class="label">${profile.studentId}</div></div>
      <div class="stat-card"><div class="num">${course ? course.code : "—"}</div><div class="label">Current Course</div></div>
    </div>
    <div class="glass-card">
      <h4>Quick Links</h4>
      <button class="btn-navy" onclick="document.querySelector('[data-view=library]').click()"><i class="fa-solid fa-book-open"></i> Open Library</button>
      <button class="btn-gold" onclick="document.querySelector('[data-view=exams]').click()"><i class="fa-solid fa-file-pen"></i> View Exams</button>
    </div>`;
}

/* ---------- Library: ebook / handbook / syllabus ---------- */
async function renderLibrary() {
  if (!course) { main.innerHTML = "<p>You are not enrolled in a course yet.</p>"; return; }
  main.innerHTML = `<h2><i class="fa-solid fa-book-open"></i> Library — ${course.title}</h2><div id="lib-tabs" class="tab-strip">
    <button data-t="ebooks" class="active">Ebooks</button><button data-t="handbooks">Handbook</button><button data-t="syllabus">Syllabus</button>
    <button data-t="materials">Lesson Notes & Assignments</button></div><div id="lib-list">Loading…</div>`;

  const load = async (type) => {
    const wrap = document.getElementById("lib-list");
    wrap.innerHTML = "Loading…";
    const colName = type === "materials" ? "materials" : type;
    let snap;
    try { snap = await getDocs(query(collection(db, colName), where("courseId", "==", course.id))); }
    catch (e) { wrap.innerHTML = "<p>Could not load — check your connection.</p>"; return; }
    if (snap.empty) { wrap.innerHTML = "<p>Nothing uploaded here yet.</p>"; return; }
    wrap.innerHTML = "";
    snap.forEach(d => {
      const item = d.data();
      const card = document.createElement("div");
      card.className = "glass-card";
      card.style.marginBottom = "10px";
      card.innerHTML = `<strong>${item.title}</strong>
        <div style="margin-top:8px;">
          ${type === "ebooks" || type === "handbooks"
            ? `<button class="btn-gold" onclick="window.open('ebook-reader.html?url=${encodeURIComponent(item.url)}&title=${encodeURIComponent(item.title)}','_blank')"><i class="fa-solid fa-book"></i> Read</button>`
            : `<a class="btn-outline" href="${item.url}" target="_blank" rel="noopener"><i class="fa-solid fa-eye"></i> View</a>`}
        </div>`;
      wrap.appendChild(card);
    });
  };
  document.querySelectorAll("#lib-tabs button").forEach(b => {
    b.onclick = () => { document.querySelectorAll("#lib-tabs button").forEach(x => x.classList.remove("active")); b.classList.add("active"); load(b.dataset.t); };
  });
  load("ebooks");
}

/* ---------- Media: stream-only audio/video, no download, no right-click ---------- */
async function renderMedia() {
  if (!course) { main.innerHTML = "<p>You are not enrolled in a course yet.</p>"; return; }
  main.innerHTML = `<h2><i class="fa-solid fa-photo-film"></i> Audio & Video — ${course.title}</h2>
    <div id="media-tabs" class="tab-strip"><button data-t="audio" class="active">Audio Teachings</button><button data-t="videos">Videos</button></div>
    <div id="media-list">Loading…</div>`;
  const load = async (type) => {
    const wrap = document.getElementById("media-list");
    wrap.innerHTML = "Loading…";
    const snap = await getDocs(query(collection(db, COL[type]), where("courseId", "==", course.id)));
    if (snap.empty) { wrap.innerHTML = "<p>Nothing here yet.</p>"; return; }
    wrap.innerHTML = "";
    snap.forEach(d => {
      const item = d.data();
      const card = document.createElement("div");
      card.className = "glass-card"; card.style.marginBottom = "12px";
      card.innerHTML = `<strong>${item.title}</strong><br>` +
        (type === "audio"
          ? `<audio controls controlsList="nodownload noplaybackrate" src="${item.url}" style="width:100%;margin-top:8px;"></audio>`
          : `<video controls controlsList="nodownload noplaybackrate" src="${item.url}" style="width:100%;margin-top:8px;border-radius:10px;"></video>`);
      protectElement(card);
      wrap.appendChild(card);
    });
  };
  document.querySelectorAll("#media-tabs button").forEach(b => {
    b.onclick = () => { document.querySelectorAll("#media-tabs button").forEach(x => x.classList.remove("active")); b.classList.add("active"); load(b.dataset.t); };
  });
  load("audio");
}

/* ---------- Exams & Results ---------- */
async function renderExams() {
  if (!course) { main.innerHTML = "<p>You are not enrolled in a course yet.</p>"; return; }
  main.innerHTML = `<h2><i class="fa-solid fa-file-pen"></i> Exams — ${course.title}</h2>
    <div class="glass-card">
      <p>Your exam will open in secure fullscreen mode. Ensure you have a stable connection before starting.</p>
      <button class="btn-gold" id="start-exam"><i class="fa-solid fa-lock"></i> Start Exam</button>
    </div>
    <div class="glass-card" style="margin-top:20px;"><h4>Your Results</h4><div id="results-list">Loading…</div></div>`;
  document.getElementById("start-exam").onclick = () => {
    window.location.href = `exam.html?course=${course.id}`;
  };
  const snap = await getDocs(query(collection(db, COL.results), where("studentUid", "==", user.uid), where("courseId", "==", course.id)));
  let rows = "";
  snap.forEach(d => { const r = d.data(); rows += `<tr><td>${r.score}/${r.total}</td><td>${r.percent}%</td><td>${r.grade}</td><td>${r.date || ""}</td></tr>`; });
  document.getElementById("results-list").innerHTML = snap.empty ? "<p>No results yet.</p>" : `<table class="data-table"><thead><tr><th>Score</th><th>%</th><th>Grade</th><th>Date</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ---------- Certificates ---------- */
async function renderCertificates() {
  main.innerHTML = `<h2><i class="fa-solid fa-certificate"></i> Certificates</h2><div class="glass-card"><div id="cert-list">Checking eligibility…</div></div>`;
  const snap = await getDocs(query(collection(db, COL.results), where("studentUid", "==", user.uid)));
  const wrap = document.getElementById("cert-list");
  const passed = [];
  snap.forEach(d => { const r = d.data(); if (r.percent >= 50) passed.push(r); });
  if (!passed.length) { wrap.innerHTML = "<p>Complete and pass a course exam (50%+) to unlock your certificate.</p>"; return; }
  wrap.innerHTML = "";
  passed.forEach(r => {
    const btn = document.createElement("button");
    btn.className = "btn-gold"; btn.style.marginRight = "8px"; btn.style.marginBottom = "8px";
    btn.innerHTML = `<i class="fa-solid fa-download"></i> ${r.courseTitle || r.courseId} Certificate`;
    btn.onclick = () => generateCertificate(r);
    wrap.appendChild(btn);
  });
}

async function generateCertificate(result) {
  const { jsPDF } = await import("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm");
  const pdf = new jsPDF({ orientation: "landscape" });
  const verifyCode = `${profile.studentId}-${result.courseId}-${Date.now().toString(36)}`.toUpperCase();

  pdf.setFillColor(11, 37, 69); pdf.rect(0, 0, 297, 210, "F");
  pdf.setDrawColor(212, 175, 55); pdf.setLineWidth(2); pdf.rect(8, 8, 281, 194);
  pdf.setTextColor(255, 255, 255);
  pdf.setFont("times", "bold"); pdf.setFontSize(22);
  pdf.text("CAC Good Works Assembly Believers Bible College", 148, 40, { align: "center" });
  pdf.setFontSize(16); pdf.text("Certificate of Completion", 148, 55, { align: "center" });
  pdf.setFontSize(13); pdf.text("This certifies that", 148, 80, { align: "center" });
  pdf.setFont("times", "bolditalic"); pdf.setFontSize(26); pdf.setTextColor(212, 175, 55);
  pdf.text(profile.fullName, 148, 100, { align: "center" });
  pdf.setFont("times", "normal"); pdf.setFontSize(13); pdf.setTextColor(255, 255, 255);
  pdf.text(`has successfully completed the course`, 148, 115, { align: "center" });
  pdf.setFont("times", "bold"); pdf.text(`${result.courseTitle || result.courseId}`, 148, 125, { align: "center" });
  pdf.setFont("times", "normal");
  pdf.text(`with a grade of ${result.grade} (${result.percent}%)`, 148, 135, { align: "center" });
  pdf.text(`Date: ${new Date().toLocaleDateString()}`, 40, 175);
  pdf.text(`Verification Code: ${verifyCode}`, 148, 190, { align: "center" });
  pdf.text("Registrar", 250, 175);
  pdf.save(`Certificate-${profile.studentId}.pdf`);
  await logActivity(user.uid, "student", "download_certificate", verifyCode);
  toast("Certificate downloaded", "success");
}

/* ---------- Ask a Question ---------- */
async function renderQuestions() {
  if (!course) { main.innerHTML = "<p>You are not enrolled in a course yet.</p>"; return; }
  main.innerHTML = `<h2><i class="fa-solid fa-comments"></i> Ask a Question — ${course.title}</h2>
    <div class="glass-card">
      <form id="q-form"><div class="form-field"><label>Your question</label><textarea id="q-text" rows="3" required></textarea></div>
      <button class="btn-gold" type="submit"><i class="fa-solid fa-paper-plane"></i> Submit</button></form>
    </div>
    <div class="glass-card" style="margin-top:20px;"><h4>Your Questions</h4><div id="my-q">Loading…</div></div>`;
  document.getElementById("q-form").onsubmit = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, COL.questions), {
      courseId: course.id, studentUid: user.uid, studentName: profile.fullName,
      question: document.getElementById("q-text").value, createdAt: serverTimestamp()
    });
    toast("Question submitted", "success"); e.target.reset(); loadMyQuestions();
  };
  loadMyQuestions();
}
async function loadMyQuestions() {
  const snap = await getDocs(query(collection(db, COL.questions), where("studentUid", "==", user.uid)));
  let rows = "";
  snap.forEach(d => { const q = d.data(); rows += `<tr><td>${q.question}</td><td>${q.answer || "Awaiting answer"}</td></tr>`; });
  document.getElementById("my-q").innerHTML = snap.empty ? "<p>No questions yet.</p>" : `<table class="data-table"><thead><tr><th>Question</th><th>Answer</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ---------- Feedback ---------- */
function renderFeedback() {
  if (!course) { main.innerHTML = "<p>You are not enrolled in a course yet.</p>"; return; }
  main.innerHTML = `<h2><i class="fa-solid fa-star"></i> Feedback — ${course.title}</h2>
    <div class="glass-card">
      <form id="fb-form">
        <div class="form-field"><label>Rating (1-5)</label><input type="number" min="1" max="5" id="fb-rating" required></div>
        <div class="form-field"><label>Comments / Suggestions</label><textarea id="fb-comment" rows="3"></textarea></div>
        <button class="btn-gold" type="submit"><i class="fa-solid fa-paper-plane"></i> Submit Feedback</button>
      </form>
    </div>`;
  document.getElementById("fb-form").onsubmit = async (e) => {
    e.preventDefault();
    await addDoc(collection(db, COL.feedback), {
      courseId: course.id, studentUid: user.uid,
      rating: Number(document.getElementById("fb-rating").value),
      comment: document.getElementById("fb-comment").value,
      createdAt: serverTimestamp()
    });
    toast("Thank you for your feedback!", "success"); e.target.reset();
  };
}
