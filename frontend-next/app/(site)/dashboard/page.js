'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../../../components/ProtectedRoute';
import ProductStatusCard from '../../../components/dashboard/ProductStatusCard';
import { getMe, listMyAssessments, listMyCourses, listMyEbooks } from '../../../lib/apiClient';

// New, separate from /account (not an addition to it) — Milestone 3.1
// Developer Plan, Module 3. /account covers the core audit/scan product;
// this page covers Explore products (courses, assessments, books).
function DashboardContent() {
  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  const [assessments, setAssessments] = useState([]);
  const [ebooks, setEbooks] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      const me = await getMe();
      if (!me?.user) {
        setLoading(false);
        return;
      }

      const [coursesRes, assessmentsRes, ebooksRes] = await Promise.all([
        listMyCourses(),
        listMyAssessments(),
        listMyEbooks(),
      ]);

      if (coursesRes?.error || assessmentsRes?.error || ebooksRes?.error) {
        setError(coursesRes?.error || assessmentsRes?.error || ebooksRes?.error);
      }

      setCourses(Array.isArray(coursesRes?.courses) ? coursesRes.courses : []);
      setAssessments(Array.isArray(assessmentsRes?.assessments) ? assessmentsRes.assessments : []);
      setEbooks(Array.isArray(ebooksRes?.ebooks) ? ebooksRes.ebooks : []);
      setLoading(false);
    })();
  }, []);

  const hasAnyProducts = courses.length > 0 || assessments.length > 0 || ebooks.length > 0;

  return (
    <section className="sec">
      <style>{`
        .dash-wrap { max-width: 1140px; margin: 0 auto; padding: 0 24px; }
        .dash-header { padding: 104px 0 32px; }
        .dash-empty {
          border: 1px dashed var(--sandd);
          border-radius: var(--rl);
          padding: 48px 24px;
          text-align: center;
          color: var(--ink6);
        }
      `}</style>
      <div className="dash-wrap">
        <div className="dash-header">
          <h1 className="h2">Your Dashboard</h1>
          <p className="lead">Everything you&apos;ve purchased from Explore, in one place.</p>
          <p style={{ marginTop: 8 }}>
            Looking for your accessibility audits and scans? Visit{' '}
            <Link href="/account" className="card-lnk" style={{ display: 'inline', marginTop: 0 }}>your account</Link>.
          </p>
        </div>

        {loading && <p>Loading…</p>}
        {error && <p style={{ color: '#c0392b' }}>{error}</p>}

        {!loading && !hasAnyProducts && (
          <div className="dash-empty">
            <p>You haven&apos;t purchased anything from Explore yet.</p>
            <Link href="/explore" className="btn btn-p" style={{ marginTop: 16, display: 'inline-block' }}>
              Explore our products
            </Link>
          </div>
        )}

        {!loading && hasAnyProducts && (
          <div className="g3">
            {courses.map((course) => (
              <ProductStatusCard
                key={course.courseId}
                productType="course"
                category="Online Training"
                title={course.title}
                status={course.status}
                id={course.courseId}
              />
            ))}
            {assessments.map((assessment) => (
              <ProductStatusCard
                key={assessment.assessmentId}
                productType="assessment"
                category="Assessment"
                title="AI Readiness Assessment"
                status={assessment.status}
                id={assessment.assessmentId}
              />
            ))}
            {ebooks.map((ebook) => (
              <ProductStatusCard
                key={ebook.ebookId}
                productType="ebook"
                category="Books"
                title={ebook.title}
                status="purchased"
                id={ebook.ebookId}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
