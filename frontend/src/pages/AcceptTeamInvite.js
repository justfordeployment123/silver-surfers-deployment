import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { acceptTeamInvitation, getInvitationDetails, getMe } from '../api';

const STYLES = `
.ati-bg { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: var(--t9); padding: 96px 16px 40px; }
.ati-card { background: #fff; border-radius: var(--r); box-shadow: 0 24px 64px rgba(0,0,0,0.18); padding: 32px; width: 100%; max-width: 440px; }
.ati-icon { width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
.ati-icon-teal { background: var(--t05); }
.ati-icon-red { background: rgba(239,68,68,0.12); }
.ati-icon-green { background: rgba(16,185,129,0.12); }
.ati-center { text-align: center; }
.ati-hd { font-family: var(--ffd); font-size: 22px; font-weight: 700; color: var(--t9); margin-bottom: 10px; }
.ati-sub { font-size: 14px; color: var(--ink6); margin-bottom: 20px; }
.ati-info { background: var(--sandd); border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; }
.ati-info p { font-size: 13px; color: var(--ink6); margin: 4px 0; }
.ati-info strong { color: var(--ink); }
.ati-feats { background: var(--sandd); border-radius: 10px; padding: 14px 16px; margin-bottom: 24px; }
.ati-feats h3 { font-size: 13px; font-weight: 700; color: var(--t9); margin-bottom: 10px; }
.ati-feats ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
.ati-feats li { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--ink6); }
.ati-feats li svg { flex-shrink: 0; color: var(--t4); }
.ati-btns { display: flex; flex-direction: column; gap: 10px; }
.ati-note { font-size: 11px; color: var(--ink6); text-align: center; margin-top: 16px; }
`;

const CheckIcon = () => (
  <svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

const Spinner = () => (
  <svg className="animate-spin" style={{ width: 18, height: 18, marginRight: 8 }} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

const AcceptTeamInvite = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [invitationDetails, setInvitationDetails] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState('');

  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) { setError('No invitation token found in URL.'); setLoading(false); return; }
    const initInvitation = async () => {
      try {
        const userResult = await getMe();
        const authenticated = !userResult.error;
        setIsAuthenticated(authenticated);
        if (authenticated && userResult.email) setCurrentUserEmail(userResult.email.toLowerCase());
        const inviteDetails = await getInvitationDetails(token);
        if (inviteDetails.error) { setError(inviteDetails.error); setLoading(false); return; }
        setInvitationDetails(inviteDetails);
        if (!authenticated) {
          localStorage.setItem('pendingInviteToken', token);
          localStorage.setItem('pendingInviteEmail', inviteDetails.invitedEmail);
          navigate(`/signup?invite=${token}&email=${encodeURIComponent(inviteDetails.invitedEmail)}`);
          return;
        }
        if (authenticated && userResult.email && userResult.email.toLowerCase() !== inviteDetails.invitedEmail.toLowerCase()) {
          setError(`This invitation is for ${inviteDetails.invitedEmail}. You are logged in as ${userResult.email}. Please log out and create an account or log in with ${inviteDetails.invitedEmail}.`);
          setLoading(false); return;
        }
        setLoading(false);
      } catch {
        setError('Failed to load invitation details.');
        setLoading(false);
      }
    };
    initInvitation();
  }, [token, navigate]);

  const handleAcceptInvitation = async () => {
    if (!token) { setError('No invitation token found.'); return; }
    if (invitationDetails && currentUserEmail && currentUserEmail !== invitationDetails.invitedEmail.toLowerCase()) {
      setError(`Email mismatch. This invitation is for ${invitationDetails.invitedEmail}.`); return;
    }
    setLoading(true); setError('');
    try {
      const result = await acceptTeamInvitation(token);
      if (result.error) { setError(result.error); }
      else {
        setSuccess(true);
        localStorage.removeItem('pendingInviteToken');
        localStorage.removeItem('pendingInviteEmail');
        setTimeout(() => navigate('/subscription'), 3000);
      }
    } catch {
      setError('Failed to accept invitation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    localStorage.setItem('pendingInviteToken', token);
    if (invitationDetails) localStorage.setItem('pendingInviteEmail', invitationDetails.invitedEmail);
    navigate(`/signup?invite=${token}&email=${encodeURIComponent(invitationDetails?.invitedEmail || '')}`);
  };

  if (loading) {
    return (
      <>
        <style>{STYLES}</style>
        <div className="ati-bg">
          <div className="ati-card ati-center">
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <svg className="animate-spin" style={{ width: 48, height: 48, color: 'var(--t4)' }} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--ink6)' }}>Loading invitation…</p>
          </div>
        </div>
      </>
    );
  }

  if (error && !success) {
    return (
      <>
        <style>{STYLES}</style>
        <div className="ati-bg">
          <div className="ati-card ati-center">
            <div className="ati-icon ati-icon-red">
              <svg width="28" height="28" fill="none" stroke="var(--coral)" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h1 className="ati-hd">Invitation Error</h1>
            <p className="ati-sub">{error}</p>
            <div className="ati-btns">
              {isAuthenticated && invitationDetails && (
                <button onClick={handleLogout} className="btn btn-d" style={{ width: '100%', justifyContent: 'center' }}>
                  Log Out & Continue with {invitationDetails.invitedEmail}
                </button>
              )}
              <button onClick={() => navigate('/login')} className="btn btn-o" style={{ width: '100%', justifyContent: 'center' }}>
                Go to Login
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (success) {
    return (
      <>
        <style>{STYLES}</style>
        <div className="ati-bg">
          <div className="ati-card ati-center">
            <div className="ati-icon ati-icon-green">
              <svg width="28" height="28" fill="none" stroke="var(--t4)" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="ati-hd">Welcome to the Team!</h1>
            <p className="ati-sub">
              You have successfully joined the SilverSurfers team. You now have access to all team features and will share the subscription benefits.
            </p>
            <p style={{ fontSize: '12px', color: 'var(--ink6)', marginBottom: '20px' }}>Redirecting to your subscription dashboard…</p>
            <button onClick={() => navigate('/subscription')} className="btn btn-d" style={{ width: '100%', justifyContent: 'center' }}>
              Go to Dashboard Now
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{STYLES}</style>
      <div className="ati-bg">
        <div className="ati-card">
          <div className="ati-center" style={{ marginBottom: '24px' }}>
            <div className="ati-icon ati-icon-teal">
              <svg width="28" height="28" fill="none" stroke="var(--t4)" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h1 className="ati-hd">Team Invitation</h1>
            <p className="ati-sub">You've been invited to join a SilverSurfers team!</p>
            {invitationDetails && (
              <div className="ati-info">
                <p><strong>Team Owner:</strong> {invitationDetails.teamOwnerEmail}</p>
                <p><strong>Plan:</strong> {invitationDetails.planName}</p>
                <p><strong>Invited Email:</strong> {invitationDetails.invitedEmail}</p>
              </div>
            )}
          </div>

          <div className="ati-feats">
            <h3>What you'll get access to:</h3>
            <ul>
              <li><CheckIcon /> Website accessibility audits</li>
              <li><CheckIcon /> Detailed accessibility reports</li>
              <li><CheckIcon /> Priority support</li>
              <li><CheckIcon /> Shared team usage limits</li>
            </ul>
          </div>

          <div className="ati-btns">
            <button onClick={handleAcceptInvitation} disabled={loading} className="btn btn-d" style={{ width: '100%', justifyContent: 'center', opacity: loading ? 0.65 : 1 }}>
              {loading ? <><Spinner />Accepting Invitation…</> : 'Accept Invitation'}
            </button>
          </div>
          <p className="ati-note">
            By accepting this invitation, you'll be added to the team and gain access to shared subscription benefits.
          </p>
        </div>
      </div>
    </>
  );
};

export default AcceptTeamInvite;
