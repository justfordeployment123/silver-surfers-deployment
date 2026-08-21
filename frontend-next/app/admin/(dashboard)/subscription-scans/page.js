// NEW route (not present in the old app): frontend/src/pages/admin/
// AdminSubscriptionScans.js was a real, working, already-paginated
// component that was never wired to a route or sidebar entry in the CRA
// app — only its planType-filtered siblings (starter/pro/onetime-scans)
// were routed. Per the migration plan this is intentionally completed
// here as a small scope addition: an "All Subscription Scans" view across
// every plan (planType="all", its default).
import AdminSubscriptionScans from '../../../../components/admin/AdminSubscriptionScans';

export default function AdminAllSubscriptionScansPage() {
  return <AdminSubscriptionScans />;
}
