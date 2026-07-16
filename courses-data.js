/* ==========================================================================
   COURSE CATALOG - CAC Good Works Assembly Believers Bible College
   Exactly 10 dedicated courses, each with its own teacher slot, ebook,
   handbook, syllabus, audio, video, assignments, exams and certificate.
   Admin can edit these live in Firestore (collection "courses"); this file
   is only the seed/default data used the first time the app runs.
   ========================================================================== */
export const DEFAULT_COURSES = [
  { id: "c01", code: "BIB101", title: "Foundations of Biblical Doctrine", teacherId: "", color: "#1e3a8a" },
  { id: "c02", code: "BIB102", title: "Old Testament Survey", teacherId: "", color: "#0f766e" },
  { id: "c03", code: "BIB103", title: "New Testament Survey", teacherId: "", color: "#b45309" },
  { id: "c04", code: "BIB104", title: "Systematic Theology I", teacherId: "", color: "#7c2d12" },
  { id: "c05", code: "BIB105", title: "Systematic Theology II", teacherId: "", color: "#4c1d95" },
  { id: "c06", code: "BIB106", title: "Homiletics & Preaching", teacherId: "", color: "#831843" },
  { id: "c07", code: "BIB107", title: "Church History", teacherId: "", color: "#134e4a" },
  { id: "c08", code: "BIB108", title: "Christian Ethics & Leadership", teacherId: "", color: "#1e293b" },
  { id: "c09", code: "BIB109", title: "Pastoral Counseling", teacherId: "", color: "#78350f" },
  { id: "c10", code: "BIB110", title: "Missions & Evangelism", teacherId: "", color: "#3730a3" }
];

export async function seedCourses(db, collection, doc, setDoc, getDocs, COL) {
  const snap = await getDocs(collection(db, COL.courses));
  if (!snap.empty) return; // already seeded
  for (const c of DEFAULT_COURSES) {
    await setDoc(doc(db, COL.courses, c.id), {
      ...c,
      createdAt: new Date().toISOString(),
      studentCount: 0
    });
  }
}
