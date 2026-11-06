'use client';

import { useEffect, useMemo, useState } from 'react';
import { adminListCourses, adminUpdateCourse } from '../../../../lib/apiClient';

const styles = `
.acm-head{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;margin-bottom:24px}.acm-title{font-family:var(--ffd);font-size:32px;color:var(--ink);margin:0 0 8px}.acm-copy{color:var(--ink6);font-size:16px;line-height:1.6;max-width:720px;margin:0}.acm-card{background:var(--surface);border:1px solid var(--sandd);border-radius:16px;padding:22px;margin-bottom:18px;box-shadow:0 6px 20px rgba(16,47,69,.05)}.acm-field{display:flex;flex-direction:column;gap:7px;flex:1}.acm-field label{font-size:14px;font-weight:700;color:var(--ink)}.acm-field input,.acm-field textarea,.acm-select{width:100%;border:1px solid var(--sandd);border-radius:9px;background:var(--surface);color:var(--ink);font:inherit;padding:11px 12px;box-sizing:border-box}.acm-field textarea{min-height:90px;resize:vertical}.acm-field input:focus,.acm-field textarea:focus,.acm-select:focus{outline:2px solid var(--t4);outline-offset:1px}.acm-row{display:flex;gap:14px;align-items:flex-end}.acm-module-head{display:flex;align-items:center;gap:12px;margin-bottom:16px}.acm-module-head h2{font-family:var(--ffd);font-size:21px;color:var(--ink);margin:0;flex:1}.acm-badge{background:var(--t05);color:var(--t6);border-radius:999px;padding:5px 10px;font-size:13px;font-weight:700}.acm-lesson{border:1px solid var(--sandd);border-radius:12px;padding:18px;margin-top:14px;background:var(--sand)}.acm-lesson-head{display:flex;align-items:center;gap:10px;margin-bottom:14px}.acm-lesson-head h3{font-size:17px;margin:0;flex:1;color:var(--ink)}.acm-actions{display:flex;gap:8px;flex-wrap:wrap}.acm-btn{border:1px solid var(--t4);border-radius:9px;background:var(--surface);color:var(--t6);padding:9px 13px;font:inherit;font-weight:700;cursor:pointer}.acm-btn:hover{background:var(--t05)}.acm-btn:disabled{opacity:.45;cursor:not-allowed}.acm-primary{background:var(--t6);color:#fff;border-color:var(--t6)}.acm-primary:hover{background:var(--t8)}.acm-danger{border-color:#d65d5d;color:#b23d3d}.acm-danger:hover{background:#fff2f2}.acm-status{border-radius:10px;padding:12px 14px;margin-bottom:18px;font-weight:600}.acm-error{background:#fff2f2;color:#a52f2f;border:1px solid #efc3c3}.acm-success{background:#edf9f3;color:#1f704e;border:1px solid #bce4d1}.acm-empty{text-align:center;padding:40px;color:var(--ink6)}.acm-footer{position:sticky;bottom:16px;display:flex;justify-content:flex-end;gap:10px;padding:14px;background:color-mix(in srgb,var(--surface) 92%,transparent);border:1px solid var(--sandd);border-radius:14px;box-shadow:0 8px 30px rgba(16,47,69,.14);backdrop-filter:blur(8px)}@media(max-width:720px){.acm-head,.acm-row{flex-direction:column;align-items:stretch}.acm-actions{justify-content:flex-start}.acm-title{font-size:27px}}
`;

const idPart = (value) => String(value || 'item').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'item';
const newId = (prefix, title) => `${prefix}-${idPart(title)}-${Date.now().toString(36)}`;
const clone = (value) => JSON.parse(JSON.stringify(value));

export default function CourseManagementPage() {
  const [courses, setCourses] = useState([]);
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState(null);
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => { (async () => {
    const result = await adminListCourses();
    if (result.error) setMessage({ type: 'error', text: result.error });
    else {
      const items = result.items || [];
      setCourses(items);
      const first = items.find(item => item.slug === 'ai-edge') || items[0];
      if (first) { setSelected(first._id); setDraft(clone(first)); setSaved(clone(first)); }
    }
    setLoading(false);
  })(); }, []);

  const dirty = useMemo(() => draft && saved && JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const chooseCourse = (id) => {
    if (dirty && !window.confirm('Discard your unsaved course changes?')) return;
    const course = courses.find(item => item._id === id);
    setSelected(id); setDraft(clone(course)); setSaved(clone(course)); setMessage(null);
  };
  const setCourse = (field, value) => setDraft(current => ({ ...current, [field]: value }));
  const setModule = (index, field, value) => setDraft(current => ({ ...current, modules: current.modules.map((item, i) => i === index ? { ...item, [field]: value } : item) }));
  const setLesson = (mi, li, field, value) => setDraft(current => ({ ...current, modules: current.modules.map((module, i) => i !== mi ? module : { ...module, lessons: module.lessons.map((lesson, j) => j === li ? { ...lesson, [field]: value } : lesson) }) }));
  const move = (items, from, to) => { const result = [...items]; const [item] = result.splice(from, 1); result.splice(to, 0, item); return result; };
  const moveModule = (from, to) => setDraft(current => ({ ...current, modules: move(current.modules, from, to) }));
  const moveLesson = (mi, from, to) => setDraft(current => ({ ...current, modules: current.modules.map((module, i) => i === mi ? { ...module, lessons: move(module.lessons, from, to) } : module) }));
  const addModule = () => setDraft(current => ({ ...current, modules: [...current.modules, { moduleId: newId('module', 'new'), title: 'New Module', lessons: [] }] }));
  const removeModule = (index) => { if (window.confirm('Remove this module and all of its lessons?')) setDraft(current => ({ ...current, modules: current.modules.filter((_, i) => i !== index) })); };
  const addLesson = (mi) => setDraft(current => ({ ...current, modules: current.modules.map((module, i) => i === mi ? { ...module, lessons: [...module.lessons, { lessonId: newId('lesson', 'new'), title: 'New Lesson', youtubeId: '', description: '', downloads: [] }] } : module) }));
  const removeLesson = (mi, li) => { if (window.confirm('Remove this lesson? Existing completion history will be kept, but the lesson will no longer appear.')) setDraft(current => ({ ...current, modules: current.modules.map((module, i) => i === mi ? { ...module, lessons: module.lessons.filter((_, j) => j !== li) } : module) })); };
  const save = async () => {
    setSaving(true); setMessage(null);
    const result = await adminUpdateCourse(draft._id || draft.slug, { title: draft.title, modules: draft.modules });
    if (result.error) setMessage({ type: 'error', text: result.error });
    else {
      const updated = result.course;
      setDraft(clone(updated)); setSaved(clone(updated));
      setCourses(items => items.map(item => item._id === updated._id ? updated : item));
      setMessage({ type: 'success', text: 'Course changes saved. Customers will see the updated course immediately.' });
    }
    setSaving(false); window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) return <><style>{styles}</style><div className="acm-card acm-empty">Loading courses…</div></>;
  return <><style>{styles}</style>
    <div className="acm-head"><div><h1 className="acm-title">Course Management</h1><p className="acm-copy">Manage training modules, lessons, YouTube videos, and descriptions. Reorder content with the arrow buttons, then save once when everything is ready.</p></div></div>
    {message && <div role="alert" className={`acm-status acm-${message.type}`}>{message.text}</div>}
    {!draft ? <div className="acm-card acm-empty">No courses are available. Run the AI Edge seed script before using this page.</div> : <>
      <div className="acm-card"><div className="acm-row"><div className="acm-field"><label htmlFor="course-select">Course</label><select id="course-select" className="acm-select" value={selected} onChange={e => chooseCourse(e.target.value)}>{courses.map(course => <option key={course._id} value={course._id}>{course.title}</option>)}</select></div><div className="acm-field"><label htmlFor="course-title">Course title</label><input id="course-title" value={draft.title} onChange={e => setCourse('title', e.target.value)} /></div></div></div>
      {(draft.modules || []).map((module, mi) => <section className="acm-card" key={module.moduleId}>
        <div className="acm-module-head"><span className="acm-badge">Module {mi + 1}</span><h2>{module.title || 'Untitled module'}</h2><div className="acm-actions"><button className="acm-btn" disabled={mi === 0} onClick={() => moveModule(mi, mi - 1)} aria-label={`Move module ${mi + 1} up`}>↑ Up</button><button className="acm-btn" disabled={mi === draft.modules.length - 1} onClick={() => moveModule(mi, mi + 1)} aria-label={`Move module ${mi + 1} down`}>↓ Down</button><button className="acm-btn acm-danger" onClick={() => removeModule(mi)}>Remove</button></div></div>
        <div className="acm-field"><label htmlFor={`module-${mi}`}>Module title</label><input id={`module-${mi}`} value={module.title} onChange={e => setModule(mi, 'title', e.target.value)} /></div>
        {(module.lessons || []).map((lesson, li) => <article className="acm-lesson" key={lesson.lessonId}>
          <div className="acm-lesson-head"><h3>Lesson {li + 1}: {lesson.title || 'Untitled'}</h3><div className="acm-actions"><button className="acm-btn" disabled={li === 0} onClick={() => moveLesson(mi, li, li - 1)}>↑ Up</button><button className="acm-btn" disabled={li === module.lessons.length - 1} onClick={() => moveLesson(mi, li, li + 1)}>↓ Down</button><button className="acm-btn acm-danger" onClick={() => removeLesson(mi, li)}>Remove</button></div></div>
          <div className="acm-row"><div className="acm-field"><label>Lesson title</label><input value={lesson.title} onChange={e => setLesson(mi, li, 'title', e.target.value)} /></div><div className="acm-field"><label>YouTube link or video ID</label><input value={lesson.youtubeId || ''} placeholder="https://youtu.be/..." onChange={e => setLesson(mi, li, 'youtubeId', e.target.value)} /></div></div>
          <div className="acm-field" style={{marginTop:14}}><label>Description</label><textarea value={lesson.description || ''} onChange={e => setLesson(mi, li, 'description', e.target.value)} /></div>
        </article>)}
        <button className="acm-btn" style={{marginTop:16}} onClick={() => addLesson(mi)}>+ Add lesson</button>
      </section>)}
      <button className="acm-btn" onClick={addModule}>+ Add module</button>
      <div className="acm-footer"><button className="acm-btn" disabled={!dirty || saving} onClick={() => { setDraft(clone(saved)); setMessage(null); }}>Discard changes</button><button className="acm-btn acm-primary" disabled={!dirty || saving} onClick={save}>{saving ? 'Saving…' : 'Save course'}</button></div>
    </>}
  </>;
}
