'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import ProtectedRoute from '../../../../components/ProtectedRoute';
import { getCourseDetail, getMe, markCourseLessonComplete } from '../../../../lib/apiClient';

function CheckMark() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="var(--t6)" />
      <path d="M6 10.2l2.4 2.4L14 7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Milestone 3.1 Developer Plan, Module 6. Flat module/lesson list, not a
// collapsible accordion — the seeded course is small enough that hiding
// content behind disclosure widgets would add interaction cost without a
// real benefit; revisit if a course ships with many more lessons per module.
function CoursePlayerContent() {
  const { courseId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [course, setCourse] = useState(null);
  const [moduleProgress, setModuleProgress] = useState([]);
  const [activeLessonId, setActiveLessonId] = useState(null);
  const [marking, setMarking] = useState(false);

  const completedLessonIds = useMemo(() => {
    const set = new Set();
    moduleProgress.forEach((mp) => (mp.completedLessonIds || []).forEach((id) => set.add(id)));
    return set;
  }, [moduleProgress]);

  async function load() {
    setLoading(true);
    setError('');
    const result = await getCourseDetail(courseId);
    if (result?.error) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setCourse(result.course);
    const progress = result.progress?.moduleProgress || [];
    setModuleProgress(progress);

    if (!activeLessonId) {
      const allLessons = (result.course?.modules || []).flatMap((m) => m.lessons || []);
      const completed = new Set(progress.flatMap((mp) => mp.completedLessonIds || []));
      const firstIncomplete = allLessons.find((lesson) => !completed.has(lesson.lessonId));
      setActiveLessonId((firstIncomplete || allLessons[0])?.lessonId || null);
    }
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      const me = await getMe();
      if (!me?.user) {
        setLoading(false);
        return;
      }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const activeLesson = useMemo(() => {
    if (!course || !activeLessonId) return null;
    for (const courseModule of course.modules || []) {
      const lesson = (courseModule.lessons || []).find((l) => l.lessonId === activeLessonId);
      if (lesson) return lesson;
    }
    return null;
  }, [course, activeLessonId]);

  async function handleMarkComplete() {
    if (!activeLessonId) return;
    setMarking(true);
    const result = await markCourseLessonComplete(courseId, activeLessonId);
    setMarking(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    await load();
  }

  if (loading) return <section className="sec"><div className="wrap"><p>Loading…</p></div></section>;
  if (error) return <section className="sec"><div className="wrap"><p style={{ color: '#c0392b' }}>{error}</p></div></section>;
  if (!course) return null;

  return (
    <section className="sec">
      <style>{`
        .course-player { display: grid; grid-template-columns: 300px 1fr; gap: 40px; padding: 104px 0 64px; }
        .course-sidebar-module { margin-bottom: 20px; }
        .course-sidebar-module h3 { font-size: 15px; font-weight: 700; color: var(--ink); margin-bottom: 8px; }
        .course-lesson-btn {
          display: flex; align-items: center; gap: 8px; width: 100%; text-align: left;
          background: none; border: none; padding: 8px 10px; border-radius: var(--r);
          font-size: 15px; color: var(--ink6); cursor: pointer;
        }
        .course-lesson-btn.active { background: var(--t05); color: var(--t6); font-weight: 600; }
        .course-video-wrap { aspect-ratio: 16 / 9; background: var(--sand); border-radius: var(--rl); overflow: hidden; margin-bottom: 20px; }
        .course-video-wrap iframe { width: 100%; height: 100%; border: 0; }
        .course-video-placeholder { display: flex; align-items: center; justify-content: center; height: 100%; color: var(--ink3); }
        .course-downloads { margin-top: 20px; }
        @media (max-width: 768px) {
          .course-player { grid-template-columns: 1fr; padding: 88px 0 48px; }
        }
      `}</style>
      <div className="wrap">
        <h1 className="h2" style={{ marginBottom: 24 }}>{course.title}</h1>
        <div className="course-player">
          <nav aria-label="Course modules">
            {(course.modules || []).map((courseModule) => (
              <div className="course-sidebar-module" key={courseModule.moduleId}>
                <h3>{courseModule.title}</h3>
                {(courseModule.lessons || []).map((lesson) => (
                  <button
                    key={lesson.lessonId}
                    type="button"
                    className={`course-lesson-btn${lesson.lessonId === activeLessonId ? ' active' : ''}`}
                    onClick={() => setActiveLessonId(lesson.lessonId)}
                    aria-current={lesson.lessonId === activeLessonId ? 'true' : undefined}
                  >
                    {completedLessonIds.has(lesson.lessonId) ? <CheckMark /> : <span style={{ width: 16 }} />}
                    {lesson.title}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          <div>
            {activeLesson && (
              <>
                <h2 className="h3" style={{ marginBottom: 16 }}>{activeLesson.title}</h2>
                <div className="course-video-wrap">
                  {activeLesson.youtubeId ? (
                    <iframe
                      src={`https://www.youtube.com/embed/${activeLesson.youtubeId}`}
                      title={activeLesson.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <div className="course-video-placeholder">Video coming soon</div>
                  )}
                </div>
                {activeLesson.description && <p>{activeLesson.description}</p>}

                {activeLesson.downloads?.length > 0 && (
                  <div className="course-downloads">
                    <h3 className="h3" style={{ fontSize: 16, marginBottom: 10 }}>Downloads</h3>
                    <ul>
                      {activeLesson.downloads.map((download) => (
                        <li key={download.s3Key}>{download.label}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="button"
                  className="btn btn-p"
                  style={{ marginTop: 24 }}
                  disabled={marking || completedLessonIds.has(activeLessonId)}
                  onClick={handleMarkComplete}
                >
                  {completedLessonIds.has(activeLessonId) ? 'Lesson complete' : marking ? 'Saving…' : 'Mark lesson complete'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function CoursePlayerPage() {
  return (
    <ProtectedRoute>
      <CoursePlayerContent />
    </ProtectedRoute>
  );
}
