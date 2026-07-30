import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import ScrollToTop from './components/ScrollToTop';
import Home from './pages/Home';
import Services from './pages/Services';
import About from './pages/About';
import Contact from './pages/Contact';
import FAQ from './pages/FAQ';
import Blog from './pages/Blog';
import BlogPost from './pages/BlogPost';
import Success from './pages/Success';
import Checkout from './pages/Checkout';
import Subscription from './pages/Subscription';
import SubscriptionSuccess from './pages/SubscriptionSuccess';
import PaymentSuccess from './pages/PaymentSuccess';
import AcceptTeamInvite from './pages/AcceptTeamInvite';
import TermsOfUse from './pages/TermsOfUse';
import PrivacyPolicy from './pages/PrivacyPolicy';
import AccessibilityGuides from './pages/AccessibilityGuides';
import Login from './pages/Login';
import Register from './pages/Register';
import ResendVerification from './pages/ResendVerification';
import VerifyEmail from './pages/VerifyEmail';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Account from './pages/Account';
import AnalysisDetail from './pages/AnalysisDetail';
import QuickScanDetail from './pages/QuickScanDetail';
import Monitoring from './pages/Monitoring';
import MonitoringJobDetail from './pages/MonitoringJobDetail';
import ProtectedRoute from './components/ProtectedRoute';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminBlog from './pages/admin/AdminBlog';
import AdminFAQs from './pages/admin/AdminFAQs';
import AdminAnalysis from './pages/admin/AdminAnalysis';
import AdminQuickScans from './pages/admin/AdminQuickScans';
import AdminStarterScans from './pages/admin/AdminStarterScans';
import AdminProScans from './pages/admin/AdminProScans';
import AdminOneTimeScans from './pages/admin/AdminOneTimeScans';
import AdminContact from './pages/admin/AdminContact';
import AdminUsers from './pages/admin/AdminUsers';
import AdminBulkQuickScans from './pages/admin/AdminBulkQuickScans'
import AdminContentManager from './pages/AdminContentManager';
import AdminLegal from './pages/AdminLegal';
import AdminLogin from './pages/AdminLogin';
import AdminLayout from './layouts/AdminLayout';
import './App.css';

function AppContent() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <div className="App">
      <ScrollToTop />
      {!isAdminRoute && <Header />}
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          
          {/* Admin Routes - No Header/Footer */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="blog" element={<AdminBlog />} />
            <Route path="faqs" element={<AdminFAQs />} />
            <Route path="analysis" element={<AdminAnalysis />} />
            <Route path="bulk-quick-scans" element={<AdminBulkQuickScans />} />
            <Route path="quick-scans" element={<AdminQuickScans />} />
            <Route path="starter-scans" element={<AdminStarterScans />} />
            <Route path="pro-scans" element={<AdminProScans />} />
            <Route path="onetime-scans" element={<AdminOneTimeScans />} />
            <Route path="contact" element={<AdminContact />} />
            <Route path="legal" element={<AdminLegal />} />
          </Route>
          
          {/* Legacy Admin Routes (for backward compatibility) */}
          <Route path="/admin/content" element={<ProtectedRoute role="admin"><AdminContentManager /></ProtectedRoute>} />
          
          {/* Public Routes - With Header/Footer */}
          <Route path="/services" element={<Services />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
          <Route path="/faq" element={<FAQ />} />
          <Route path="/blog" element={<Blog />} />
          <Route path="/blog/:id" element={<BlogPost />} />
          <Route path="/success" element={<Success />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/subscription" element={<ProtectedRoute><Subscription /></ProtectedRoute>} />
          <Route path="/subscription-success" element={<SubscriptionSuccess />} />
          <Route path="/payment-success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
          <Route path="/team/accept" element={<AcceptTeamInvite />} />
          <Route path="/terms" element={<TermsOfUse />} />
          <Route path="/terms-of-use" element={<TermsOfUse />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/accessibility-guides" element={<AccessibilityGuides />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/signup" element={<Register />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/resend-verification" element={<ResendVerification />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/account" element={<ProtectedRoute><Account /></ProtectedRoute>} />
          <Route path="/account/analysis/:taskId" element={<ProtectedRoute><AnalysisDetail /></ProtectedRoute>} />
          <Route path="/account/quick-scans/:quickScanId" element={<ProtectedRoute><QuickScanDetail /></ProtectedRoute>} />
          <Route path="/monitoring" element={<ProtectedRoute><Monitoring /></ProtectedRoute>} />
          <Route path="/monitoring/:jobId" element={<ProtectedRoute><MonitoringJobDetail /></ProtectedRoute>} />
        </Routes>
      </main>
      {!isAdminRoute && <Footer />}
    </div>
  );
}

// Component to track route changes
function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    // Save current route (excluding login/signup/verify routes)
    const currentPath = location.pathname + location.search + location.hash;
    if (
      currentPath &&
      currentPath !== '/' &&
      !currentPath.includes('/login') &&
      !currentPath.includes('/signup') &&
      !currentPath.includes('/verify') &&
      !currentPath.includes('/forgot-password') &&
      !currentPath.includes('/reset-password') &&
      !currentPath.includes('/api') &&
      !currentPath.includes('undefined')
    ) {
      localStorage.setItem('lastRoute', currentPath);
    }
  }, [location]);
  return null;
}

function App() {
  return (
    <Router>
      <RouteTracker />
      <AppContent />
    </Router>
  );
}

export default App;
