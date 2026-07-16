/* ==========================================================================
   TEACHER.JS — Teacher Dashboard
   ========================================================================== */
import { guardRoute, logout } from "./auth.js";
import {
  db, storage, COL, collection, doc, getDoc, getDocs, addDoc, updateDoc,
  query, where, orderBy, serverTimestamp, ref, uploadBytesResumable, getDownloadURL,
  logActivity
} from "./firebase-config.js";
import { toast, initTheme, toggleTheme, registerServiceWorker } from "./app-shell.js";

initTheme();
registerServiceWorker();
const main = document.getElementById("main-content");
document.getElementById("theme-btn").onclick = toggleTheme;
document.getElementById("logout-btn").onclick = logout;

let user, profile, course;

guardRoute("teacher").then(async (u) => {
  user = u;
  const snap = await getDoc(doc(db, COL.teachers, u.uid));
  profile = snap.data();
  if (profile.courseId) {
    const cSnap = await getDoc(doc(db, COL.courses, profile.courseId));
    course = { id: profile.courseId, ...cSnap.data() };
  }
  bindSidebar();
  renderOverview();
});

function bindSidebar() {
  document.querySelectorAll(".sidebar a").forEach(a => {
    a.addEventListener("click", () => {
      document.querySelectorAll(".sidebar a").forEach(x => x.classList.remove("active"));
      a.classList.add("active");
      ({
        overview: renderOverview, materials: renderMaterials, studio: renderStudio,
        attendance: renderAttendance, questions: renderQuestions, feedback: renderFeedback
      })[a.dataset.view]();
    });
  });
}

function renderOverview() {
  main.innerHTML = `
    <h2>Welcome, ${profile.fullName}</h2>
    <p style="color:var(--muted);">Assigned course: <strong>${course ? course.code + " — " + course.title : "None assigned yet — contact Admin"}</strong></p>
    <div class="stat-grid">
      <div class="stat-card"><div class="num">${course ? course.code : "—"}</div><div class="label">Your Course</div></div>
      <div class="stat-card"><div class="num"><i class="fa-solid fa-id-badge"></i></div><div class="label">${profile.teacherId}</div></div>
    </div>
    <div class="glass-card">
      <h4>Quick Actions</h4>
      <button class="btn-navy" onclick="document.querySelector('[data-view=materials]').click()"><i class="fa-solid fa-cloud-arrow-up"></i> Upload Material</button>
      <button class="btn-gold" onclick="document.querySelector('[data-view=studio]').click()"><i class="fa-solid fa-video"></i> Open Studio</button>
    </div>`;
}

/* ---------- Upload materials (ebook, handbook, syllabus, assignment) ---------- */
function renderMaterials() {
  if (!course) { main.innerHTML = "<p>No course assigned yet.</p>"; return; }
  main.innerHTML = `
    <h2><i class="fa-solid fa-cloud-arrow-up"></i> Upload Materials — ${course.title}</h2>
    <div class="glass-card">
      <form id="mat-form" class="row g-2">
        <div class="col-md-4 form-field"><label>Type</label>
          <select id="m-type">
            <option value="ebooks">Ebook</option>
            <option value="handbooks">Handbook</option>
            <option value="syllabus">Syllabus</option>
            <option value="notes">Lesson Notes</option>
            <option value="assignments">Assignment</option>
          </select>
        </div>
        <div class="col-md-4 form-field"><label>Title</label><input required id="m-title" type="text"></div>
        <div class="col-md-4 form-field"><label>File</label><input required id="m-file" type="file"></div>
        <div class="col-12"><button class="btn-gold" type="submit"><i class="fa-solid fa-upload"></i> Upload</button></div>
      </form>
      <div id="m-progress" style="margin-top:10px;"></div>
    </div>`;
  document.getElementById("mat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const type = document.getElementById("m-type").value;
    const title = document.getElementById("m-title").value;
    const file = document.getElementById("m-file").files[0];
    const col = COL[type] || "notes";
    const path = `${type}/${course.id}/${Date.now()}_${file.name}`;
    const sref = ref(storage, path);
    const task = uploadBytesResumable(sref, file);
    const prog = document.getElementById("m-progress");
    task.on("state_changed", (s) => {
      const pct = Math.round((s.bytesTransferred / s.totalBytes) * 100);
      prog.innerHTML = `<div class="skeleton" style="height:10px;width:${pct}%;"></div><small>${pct}%</small>`;
    }, (err) => toast(err.message, "error"), async () => {
      const url = await getDownloadURL(sref);
      await addDoc(collection(db, col === "notes" || col === "assignments" ? "materials" : col), {
        courseId: course.id, title, url, type, uploadedBy: user.uid, uploadedAt: serverTimestamp()
      });
      await logActivity(user.uid, "teacher", "upload_" + type, title);
      toast("Uploaded!", "success");
      prog.innerHTML = ""; e.target.reset();
    });
  });
}

/* ---------- Recording Studio: audio + video via MediaRecorder ---------- */
let mediaStream, mediaRecorder, chunks = [], recKind = "video";

function renderStudio() {
  if (!course) { main.innerHTML = "<p>No course assigned yet.</p>"; return; }
  main.innerHTML = `
    <h2><i class="fa-solid fa-video"></i> Recording Studio — ${course.title}</h2>
    <div class="glass-card studio-wrap">
      <div style="flex:1;min-width:280px;">
        <div class="studio-preview"><video id="preview" autoplay muted playsinline></video></div>
        <div class="studio-controls">
          <button class="btn-navy" id="cam-on"><i class="fa-solid fa-camera"></i> Camera On</button>
          <button class="btn-outline" id="cam-off"><i class="fa-solid fa-camera-slash"></i> Camera Off</button>
          <button class="btn-navy" id="mic-on"><i class="fa-solid fa-microphone"></i> Mic On</button>
          <button class="btn-outline" id="mic-off"><i class="fa-solid fa-microphone-slash"></i> Mic Off</button>
        </div>
        <div class="studio-controls">
          <select id="rec-kind" class="form-select" style="width:auto;">
            <option value="video">Record Video Lesson</option>
            <option value="audio">Record Audio Teaching</option>
          </select>
          <button class="btn-gold" id="rec-start"><i class="fa-solid fa-circle"></i> Start Recording</button>
          <button class="btn-outline" id="rec-pause" disabled>Pause</button>
          <button class="btn-outline" id="rec-resume" disabled>Resume</button>
          <button class="btn-danger" id="rec-stop" disabled>Stop & Save</button>
        </div>
        <p id="rec-status" style="margin-top:8px;color:var(--muted);"></p>
      </div>
    </div>
    <p style="color:var(--muted);font-size:.85rem;margin-top:10px;"><i class="fa-solid fa-circle-info"></i>
      Recordings are saved automatically to Firebase Storage when you click Stop. Students can only stream — downloading is disabled on their end.</p>`;

  document.getElementById("cam-on").onclick = async () => {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    document.getElementById("preview").srcObject = mediaStream;
  };
  document.getElementById("cam-off").onclick = () => {
    mediaStream?.getVideoTracks().forEach(t => t.stop());
  };
  document.getElementById("mic-on").onclick = async () => {
    if (!mediaStream) mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    else {
      const audio = await navigator.mediaDevices.getUserMedia({ audio: true });
      audio.getAudioTracks().forEach(t => mediaStream.addTrack(t));
    }
    toast("Microphone enabled", "success");
  };
  document.getElementById("mic-off").onclick = () => {
    mediaStream?.getAudioTracks().forEach(t => t.stop());
  };
  document.getElementById("rec-kind").onchange = (e) => recKind = e.target.value;

  document.getElementById("rec-start").onclick = async () => {
    if (!mediaStream) {
      mediaStream = recKind === "audio"
        ? await navigator.mediaDevices.getUserMedia({ audio: true })
        : await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      document.getElementById("preview").srcObject = mediaStream;
    }
    chunks = [];
    mediaRecorder = new MediaRecorder(mediaStream);
    mediaRecorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mediaRecorder.onstop = saveRecording;
    mediaRecorder.start();
    document.getElementById("rec-status").innerHTML = `<span class="rec-dot"></span> Recording ${recKind}…`;
    toggleRecBtns(true);
  };
  document.getElementById("rec-pause").onclick = () => { mediaRecorder.pause(); document.getElementById("rec-status").textContent = "Paused"; };
  document.getElementById("rec-resume").onclick = () => { mediaRecorder.resume(); document.getElementById("rec-status").innerHTML = `<span class="rec-dot"></span> Recording…`; };
  document.getElementById("rec-stop").onclick = () => { mediaRecorder.stop(); toggleRecBtns(false); };
}

function toggleRecBtns(recording) {
  document.getElementById("rec-start").disabled = recording;
  document.getElementById("rec-pause").disabled = !recording;
  document.getElementById("rec-resume").disabled = !recording;
  document.getElementById("rec-stop").disabled = !recording;
}

async function saveRecording() {
  const blob = new Blob(chunks, { type: recKind === "audio" ? "audio/webm" : "video/webm" });
  const path = `${recKind === "audio" ? "audio" : "videos"}/${course.id}/${Date.now()}_lesson.webm`;
  const sref = ref(storage, path);
  document.getElementById("rec-status").textContent = "Uploading…";
  const task = uploadBytesResumable(sref, blob);
  task.on("state_changed", (s) => {
    const pct = Math.round((s.bytesTransferred / s.totalBytes) * 100);
    document.getElementById("rec-status").textContent = `Uploading ${pct}%…`;
  }, (err) => toast(err.message, "error"), async () => {
    const url = await getDownloadURL(sref);
    await addDoc(collection(db, recKind === "audio" ? COL.audio : COL.videos), {
      courseId: course.id, title: `Lesson — ${new Date().toLocaleString()}`,
      url, uploadedBy: user.uid, uploadedAt: serverTimestamp(), streamOnly: true
    });
    await logActivity(user.uid, "teacher", "record_" + recKind, course.id);
    document.getElementById("rec-status").textContent = "Saved and available to students!";
    toast("Recording saved", "success");
  });
}

/* ---------- Attendance ---------- */
async function renderAttendance() {
  if (!course) { main.innerHTML = "<p>No course assigned yet.</p>"; return; }
  main.innerHTML = `<h2><i class="fa-solid fa-clipboard-check"></i> Attendance — ${course.title}</h2><div class="glass-card"><div id="att-list">Loading…</div></div>`;
  const snap = await getDocs(query(collection(db, COL.attendance), where("courseId", "==", course.id)));
  let rows = "";
  snap.forEach(d => { const a = d.data(); rows += `<tr><td>${a.studentId}</td><td>${a.date}</td><td>${a.time}</td><td>${a.duration || "—"}</td></tr>`; });
  document.getElementById("att-list").innerHTML = snap.empty ? "<p>No attendance records yet.</p>" : `<table class="data-table"><thead><tr><th>Student</th><th>Date</th><th>Time</th><th>Duration</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/* ---------- Student Questions ---------- */
async function renderQuestions() {
  if (!course) { main.innerHTML = "<p>No course assigned yet.</p>"; return; }
  main.innerHTML = `<h2><i class="fa-solid fa-comments"></i> Student Questions — ${course.title}</h2><div id="q-list">Loading…</div>`;
  const snap = await getDocs(query(collection(db, COL.questions), where("courseId", "==", course.id)));
  const wrap = document.getElementById("q-list");
  if (snap.empty) { wrap.innerHTML = "<p>No questions yet.</p>"; return; }
  wrap.innerHTML = "";
  snap.forEach(d => {
    const q = d.data();
    const card = document.createElement("div");
    card.className = "glass-card";
    card.style.marginBottom = "12px";
    card.innerHTML = `<strong>${q.studentName || "Student"}:</strong> ${q.question}
      <div style="margin-top:8px;color:var(--muted);">${q.answer ? "<strong>Answer:</strong> " + q.answer : ""}</div>
      ${!q.answer ? `<div class="form-field" style="margin-top:10px;"><textarea rows="2" class="ans-box"></textarea><button class="btn-gold ans-btn" style="margin-top:6px;">Answer</button></div>` : ""}`;
    if (!q.answer) {
      card.querySelector(".ans-btn").onclick = async () => {
        const ans = card.querySelector(".ans-box").value;
        await updateDoc(doc(db, COL.questions, d.id), { answer: ans, answeredAt: serverTimestamp() });
        toast("Answer posted", "success");
        renderQuestions();
      };
    }
    wrap.appendChild(card);
  });
}

/* ---------- Feedback ---------- */
async function renderFeedback() {
  if (!course) { main.innerHTML = "<p>No course assigned yet.</p>"; return; }
  main.innerHTML = `<h2><i class="fa-solid fa-star"></i> Feedback — ${course.title}</h2><div class="glass-card"><div id="fb-list">Loading…</div></div>`;
  const snap = await getDocs(query(collection(db, COL.feedback), where("courseId", "==", course.id)));
  let rows = "";
  snap.forEach(d => { const f = d.data(); rows += `<tr><td>${f.rating || "—"}★</td><td>${f.comment || ""}</td></tr>`; });
  document.getElementById("fb-list").innerHTML = snap.empty ? "<p>No feedback yet.</p>" : `<table class="data-table"><thead><tr><th>Rating</th><th>Comment</th></tr></thead><tbody>${rows}</tbody></table>`;
}
