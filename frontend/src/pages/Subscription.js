import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
    createCheckoutSession,
    getSubscription,
    getSubscriptionPlans,
    createPortalSession,
    cancelSubscription,
    inviteTeamMember,
    removeTeamMember,
    getTeamMembers,
    leaveTeam,
    getTeamScans,
    upgradeSubscription,
} from "../api";

const STYLES = `
  .sub-page { min-height: 100vh; background: var(--t9); padding: 96px 16px 48px; }
  .sub-card {
    background: var(--surface);
    border-radius: var(--rl);
    padding: 28px;
    box-shadow: 0 4px 24px rgba(4,46,34,0.1);
  }
  .sub-audit-banner {
    background: var(--surface);
    border-radius: var(--rl);
    padding: 28px;
    box-shadow: 0 4px 24px rgba(4,46,34,0.1);
    text-align: center;
    margin-bottom: 24px;
    border: 2px solid var(--t1);
  }
  .sub-audit-banner.team { border-color: var(--amber); }
  .sub-team-badge {
    display: inline-block;
    background: rgba(245,158,11,0.1);
    color: var(--amber);
    font-size: 12px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 20px;
    margin-bottom: 12px;
  }
  .sub-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--sand); font-size: 14px; }
  .sub-row:last-child { border-bottom: none; }
  .sub-row-label { color: var(--ink6); }
  .sub-row-val { font-weight: 600; color: var(--ink); }
  .sub-status { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; }
  .sub-status-active { background: var(--t05); color: var(--t4); }
  .sub-status-trial { background: rgba(59,130,246,0.1); color: #2563eb; }
  .sub-status-warn { background: rgba(245,158,11,0.1); color: var(--amber); }
  .sub-status-canceled { background: rgba(239,68,68,0.1); color: var(--coral); }
  .sub-status-default { background: var(--sand); color: var(--ink6); }
  .sub-cancel-note { background: rgba(245,158,11,0.06); border: 1px solid rgba(245,158,11,0.2); border-radius: var(--r); padding: 10px 14px; font-size: 13px; color: var(--amber); }
  .sub-portal-note { background: var(--t05); border: 1px solid var(--t1); border-radius: var(--r); padding: 10px 14px; font-size: 13px; color: var(--t7); text-align: center; }
  .sub-team-info { background: var(--t05); border: 1px solid var(--t1); border-radius: var(--rl); padding: 28px; text-align: center; }
  .sub-team-icon { width: 56px; height: 56px; background: var(--sandd); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 14px; color: var(--ink6); }
  .sub-billing-toggle { display: inline-flex; align-items: center; background: var(--sand); border: 2px solid var(--sandd); border-radius: 999px; padding: 3px; }
  .sub-billing-opt {
    padding: 6px 20px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink6);
    background: none;
    border: none;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }
  .sub-billing-opt.active { background: var(--t4); color: #fff; }
  .sub-plan-card {
    border: 2px solid var(--sandd);
    border-radius: var(--r);
    padding: 24px;
    display: flex;
    flex-direction: column;
    height: 100%;
    transition: border-color 0.15s;
  }
  .sub-plan-card.current { border-color: var(--t4); background: var(--t05); }
  .sub-plan-card.popular { border-color: var(--t3); }
  .sub-plan-tag {
    display: inline-block;
    font-size: 11px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 20px;
    margin-bottom: 8px;
  }
  .sub-plan-tag.current-tag { background: var(--t4); color: #fff; }
  .sub-plan-tag.popular-tag { background: var(--t05); color: var(--t4); border: 1px solid var(--t3); }
  .sub-plan-price { font-size: 26px; font-weight: 700; color: var(--ink); font-family: var(--ffd); }
  .sub-plan-price-suffix { font-size: 13px; font-weight: 600; color: var(--ink6); }
  .sub-plan-caption { font-size: 12px; color: var(--ink6); margin-top: 2px; }
  .sub-feat-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .sub-feat-item { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; color: var(--ink6); }
  .sub-feat-check { color: var(--t4); flex-shrink: 0; margin-top: 1px; }
  .sub-member-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; background: var(--sand); border-radius: var(--r); }
  .sub-member-avatar { width: 32px; height: 32px; background: var(--t05); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--t4); flex-shrink: 0; }
  .sub-member-status { font-size: 11px; font-weight: 600; }
  .sub-member-status.active { color: var(--t4); }
  .sub-member-status.pending { color: var(--amber); }
  .sub-remove-btn { color: var(--coral); background: none; border: none; cursor: pointer; padding: 4px; line-height: 1; transition: opacity 0.15s; }
  .sub-remove-btn:hover { opacity: 0.7; }
  .sub-remove-btn:disabled { color: var(--ink3); cursor: not-allowed; }
  .sub-scan-row { border: 1px solid var(--sandd); border-radius: var(--r); padding: 14px; transition: background 0.1s; }
  .sub-scan-row:hover { background: var(--sand); }
  .sub-scan-pill { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 20px; font-size: 11px; font-weight: 600; }
  .scan-ok { background: var(--t05); color: var(--t4); }
  .scan-warn { background: rgba(245,158,11,0.1); color: var(--amber); }
  .scan-err { background: rgba(239,68,68,0.1); color: var(--coral); }
  .scan-proc { background: rgba(245,158,11,0.1); color: var(--amber); }
  .scan-default { background: var(--sand); color: var(--ink6); }
  .scan-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .scan-dot.ok { background: var(--t4); }
  .scan-dot.warn { background: var(--amber); }
  .scan-dot.err { background: var(--coral); }
  .scan-dot.proc { background: var(--amber); animation: subPulse 1s ease-in-out infinite; }
  .scan-dot.queued { background: var(--ink3); }
  @keyframes subPulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .sub-empty { text-align: center; padding: 32px 16px; }
  .sub-empty-icon { width: 48px; height: 48px; background: var(--sand); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 12px; color: var(--ink3); }
  .sub-spin { display: inline-block; width: 20px; height: 20px; border: 2px solid var(--sandd); border-top-color: var(--t4); border-radius: 50%; animation: subSpin 0.8s linear infinite; }
  @keyframes subSpin { to { transform: rotate(360deg); } }
  .sub-skel-line { height: 14px; background: rgba(255,255,255,0.08); border-radius: 6px; margin-bottom: 10px; animation: subSkelP 1.2s ease-in-out infinite; }
  @keyframes subSkelP { 0%,100%{opacity:1} 50%{opacity:0.4} }
  .sub-no-sub-card { background: var(--surface); border-radius: var(--rl); padding: 36px; box-shadow: 0 4px 24px rgba(4,46,34,0.1); }
  @media (max-width: 767px) { .sub-card { padding: 20px; } }
`;

const FeatureCheck = () => (
  <svg className="sub-feat-check" width="14" height="14" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
  </svg>
);

const Subscription = () => {
    const [currentSubscription, setCurrentSubscription] = useState(null);
    const [availablePlans, setAvailablePlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [teamMembers, setTeamMembers] = useState([]);
    const [teamLoading, setTeamLoading] = useState(false);
    const [newMemberEmail, setNewMemberEmail] = useState("");
    const [teamScans, setTeamScans] = useState([]);
    const [scansLoading, setScansLoading] = useState(false);
    const [billingCycle, setBillingCycle] = useState("yearly");
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const selectedPlan = params.get("plan");
    const selectedCycle = params.get("cycle") === "monthly" ? "monthly" : "yearly";

    useEffect(() => {
        if (error || success) window.scrollTo({ top: 0, behavior: "smooth" });
    }, [error, success]);

    const getCurrentPrice = (plan) => {
        if (plan.type === "one-time" || plan.isOneTime) return plan.price;
        return billingCycle === "yearly" ? plan.yearlyPrice : plan.monthlyPrice;
    };

    const getPriceDisplay = (plan) => {
        if (billingCycle === "yearly") {
            const perMonth = plan.yearlyPrice / 12;
            return { main: formatPrice(perMonth), suffix: "/month", caption: `billed yearly (${formatPrice(plan.yearlyPrice)}/year)` };
        }
        return { main: formatPrice(plan.monthlyPrice), suffix: "/Month", caption: `(${formatPrice(plan.monthlyPrice * 12)}/year)` };
    };

    const getDisplayFeatures = (plan) => {
        const scanLimit = plan.limits?.scansPerMonth;
        if (plan.isOneTime || plan.type === "one-time" || plan.contactSales || scanLimit === -1 || scanLimit === undefined) {
            return plan.limits.features;
        }
        const effectiveScans = billingCycle === "monthly" ? Math.floor(scanLimit / 12) : scanLimit;
        const scanLabel = `${effectiveScans} report${effectiveScans === 1 ? "" : "s"} per ${billingCycle === "monthly" ? "month" : "year"}`;
        return [scanLabel, ...plan.limits.features.slice(1)];
    };

    useEffect(() => { loadData(); }, []);

    useEffect(() => {
        if (selectedPlan && currentSubscription && !loading) {
            handleUpgradePlan(selectedPlan, selectedCycle);
        }
    }, [selectedPlan, currentSubscription, loading]);

    const handleUpgradePlan = async (planId, cycle) => {
        try {
            setActionLoading(true);
            const result = await upgradeSubscription(planId, cycle);
            if (result.error) { setError(result.error); setActionLoading(false); }
            else if (result.url) window.location.href = result.url;
        } catch (err) { setError("Failed to initiate upgrade"); setActionLoading(false); }
    };

    const loadData = async () => {
        try {
            setLoading(true);
            const [subscriptionResult, plansResult] = await Promise.all([getSubscription(), getSubscriptionPlans()]);
            if (subscriptionResult.error) {
                setError(subscriptionResult.error);
            } else {
                setCurrentSubscription(subscriptionResult.subscription);
                if (subscriptionResult.subscription) {
                    loadTeamMembers();
                    if (!subscriptionResult.subscription.isTeamMember) loadTeamScans();
                }
            }
            if (plansResult.plans) setAvailablePlans(plansResult.plans);
            if (selectedPlan && !subscriptionResult.subscription) handleSubscribe(selectedPlan, selectedCycle);
        } catch (err) { setError("Failed to load subscription data"); }
        finally { setLoading(false); }
    };

    const loadTeamMembers = async () => {
        try {
            const result = await getTeamMembers();
            if (!result.error) setTeamMembers(result.teamMembers || []);
        } catch (err) { console.error("Failed to load team members:", err); }
    };

    const loadTeamScans = async () => {
        try {
            setScansLoading(true);
            const result = await getTeamScans();
            if (!result.error) setTeamScans(result.scans || []);
        } catch (err) { console.error("Failed to load team scans:", err); }
        finally { setScansLoading(false); }
    };

    const handleSubscribe = async (planId, billingCycle = "yearly") => {
        try {
            setActionLoading(true); setError("");
            const result = await createCheckoutSession(planId, billingCycle);
            if (result.error) setError(result.error);
            else if (result.url) window.location.href = result.url;
        } catch (err) { setError("Failed to create checkout session"); }
        finally { setActionLoading(false); }
    };

    const handleManageSubscription = async () => {
        try {
            setActionLoading(true); setError("");
            const result = await createPortalSession();
            if (result.error) setError(result.error);
            else window.location.href = result.url;
        } catch (err) { setError("Failed to open subscription management portal"); }
        finally { setActionLoading(false); }
    };

    const handleCancelSubscription = async (immediate = false) => {
        if (!window.confirm(`Are you sure you want to ${immediate ? "cancel immediately" : "cancel at period end"}?`)) return;
        try {
            setActionLoading(true); setError("");
            const result = await cancelSubscription(!immediate);
            if (result.error) setError(result.error);
            else {
                setSuccess(result.message);
                setTimeout(() => { setSuccess(""); loadData(); }, 3000);
            }
        } catch (err) { setError("Failed to cancel subscription"); }
        finally { setActionLoading(false); }
    };

    const handleLeaveTeam = async () => {
        if (!window.confirm("Are you sure you want to leave this team? You will lose access to the subscription benefits.")) return;
        try {
            setActionLoading(true); setError("");
            const result = await leaveTeam();
            if (result.error) setError(result.error);
            else {
                setSuccess("Successfully left the team. You will be redirected to the subscription page.");
                setTimeout(() => { loadData(); }, 2000);
            }
        } catch (err) { setError("Failed to leave team"); }
        finally { setActionLoading(false); }
    };

    const formatPrice = (price) => {
        if (!price) return "Contact us";
        return `$${parseInt((price / 100).toFixed(0)).toLocaleString()}`;
    };

    const formatDate = (date) => new Date(date).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    const getStatusColor = (status) => {
        switch (status) {
            case "active": return "sub-status-active";
            case "trialing": return "sub-status-trial";
            case "past_due": return "sub-status-warn";
            case "canceled": return "sub-status-canceled";
            default: return "sub-status-default";
        }
    };

    const getScanStatusClass = (status) => {
        switch (status) {
            case "completed": return "scan-ok";
            case "completed_with_warnings": return "scan-warn";
            case "failed": return "scan-err";
            case "processing": return "scan-proc";
            default: return "scan-default";
        }
    };

    const getScanDotClass = (status) => {
        switch (status) {
            case "completed": return "ok";
            case "completed_with_warnings": return "warn";
            case "failed": return "err";
            case "processing": return "proc";
            default: return "queued";
        }
    };

    const handleInviteTeamMember = async (e) => {
        e.preventDefault();
        if (!newMemberEmail.trim()) return;
        try {
            setTeamLoading(true); setError("");
            const result = await inviteTeamMember(newMemberEmail.trim());
            if (result.error) setError(result.error);
            else {
                setSuccess("Team member invited successfully!");
                setNewMemberEmail("");
                loadTeamMembers();
                setTimeout(() => setSuccess(""), 3000);
            }
        } catch (err) { setError("Failed to invite team member"); }
        finally { setTeamLoading(false); }
    };

    const handleRemoveTeamMember = async (email) => {
        if (!window.confirm(`Are you sure you want to remove ${email} from your team?`)) return;
        try {
            setTeamLoading(true); setError("");
            const result = await removeTeamMember(email);
            if (result.error) setError(result.error);
            else {
                setSuccess("Team member removed successfully!");
                loadTeamMembers();
                setTimeout(() => setSuccess(""), 3000);
            }
        } catch (err) { setError("Failed to remove team member"); }
        finally { setTeamLoading(false); }
    };

    const getPlanButtonInfo = (plan) => {
        const isCurrentPlan = currentSubscription && currentSubscription.planId === plan.id;
        const hasActiveSubscription = currentSubscription && currentSubscription.status === "active";
        const isTeamMember = currentSubscription && currentSubscription.isTeamMember;

        if (plan.contactSales) return { text: "Contact Sales", link: "/contact", isDisabled: false };

        if (plan.isOneTime || plan.type === "one-time") {
            const hasOneTimeScans = currentSubscription && currentSubscription.oneTimeScans > 0;
            return { text: hasOneTimeScans ? "Use One-Time Report" : "Get Report", link: hasOneTimeScans ? "/checkout" : "/stripe-checkout", isDisabled: false };
        }

        if (isCurrentPlan && hasActiveSubscription) return { text: "Start Audit", link: "/checkout", isDisabled: false };
        if (hasActiveSubscription && !isCurrentPlan) {
            if (isTeamMember) return { text: "Contact Owner", link: "/subscription", isDisabled: false };
            return { text: "Upgrade Plan", link: `/subscription?plan=${plan.id}&cycle=${billingCycle}`, isDisabled: false };
        }
        if (isTeamMember) return { text: "Contact Owner", link: "/subscription", isDisabled: false };
        return { text: "Subscribe Now", link: `/subscription?plan=${plan.id}&cycle=${billingCycle}`, isDisabled: false };
    };

    const BillingToggle = () => (
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div className="sub-billing-toggle">
                <button type="button" className={`sub-billing-opt${billingCycle === 'yearly' ? ' active' : ''}`} onClick={() => setBillingCycle('yearly')}>
                    Billed Yearly
                </button>
                <button type="button" className={`sub-billing-opt${billingCycle === 'monthly' ? ' active' : ''}`} onClick={() => setBillingCycle('monthly')}>
                    Billed Monthly
                </button>
            </div>
        </div>
    );

    if (loading) {
        return (
            <>
                <style>{STYLES}</style>
                <div className="sub-page">
                    <div style={{ maxWidth: '960px', margin: '0 auto' }}>
                        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                            <div className="sub-skel-line" style={{ width: '300px', height: '28px', margin: '0 auto 12px', background: 'rgba(255,255,255,0.1)' }} />
                            <div className="sub-skel-line" style={{ width: '200px', height: '16px', margin: '0 auto', background: 'rgba(255,255,255,0.07)' }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
                            {[1, 2].map(i => (
                                <div key={i} className="sub-card" style={{ animation: 'subSkelP 1.2s ease-in-out infinite' }}>
                                    <div style={{ height: '18px', background: 'var(--sand)', borderRadius: '6px', width: '60%', marginBottom: '16px' }} />
                                    {[80, 65, 90, 55].map((w, j) => (
                                        <div key={j} style={{ height: '12px', background: 'var(--sandd)', borderRadius: '4px', width: `${w}%`, marginBottom: '10px' }} />
                                    ))}
                                </div>
                            ))}
                        </div>
                        <div style={{ textAlign: 'center', marginTop: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
                            <div className="sub-spin" />
                            Loading your subscription details...
                        </div>
                    </div>
                </div>
            </>
        );
    }

    return (
        <>
            <style>{STYLES}</style>
            <div className="sub-page">
                <div style={{ maxWidth: '960px', margin: '0 auto' }}>

                    <div style={{ textAlign: 'center', marginBottom: '36px' }}>
                        <h1 className="h1" style={{ color: '#fff', marginBottom: '8px' }}>Subscription Management</h1>
                        <p className="lead" style={{ color: 'rgba(255,255,255,0.65)' }}>Manage your SilverSurfers subscription</p>
                    </div>

                    {error && <div className="alert-error" style={{ marginBottom: '20px' }}><svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>{error}</div>}
                    {success && <div className="alert-success" style={{ marginBottom: '20px' }}><svg width="16" height="16" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>{success}</div>}

                    {currentSubscription ? (
                        <>
                            {/* Start Audit Banner */}
                            {currentSubscription.status === "active" && (
                                <div className={`sub-audit-banner${currentSubscription.isTeamMember ? ' team' : ''}`}>
                                    {currentSubscription.isTeamMember && <div className="sub-team-badge" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/></svg>Team Member</div>}
                                    <h3 className="h3" style={{ marginBottom: '10px' }}>Ready to Start Your Audit?</h3>
                                    <p style={{ fontSize: '14px', color: 'var(--ink6)', marginBottom: '20px' }}>
                                        You have {currentSubscription.isTeamMember ? "team access to an" : "an"} active subscription. Start auditing your website now!
                                    </p>
                                    <button onClick={() => navigate("/checkout")} className="btn btn-p">
                                        Start Full Audit
                                    </button>
                                </div>
                            )}

                            {/* Current Subscription + Team */}
                            <div style={{ display: 'grid', gridTemplateColumns: currentSubscription.limits?.maxUsers > 1 ? 'repeat(3,1fr)' : 'repeat(2,1fr)', gap: '20px', marginBottom: '20px' }}>

                                {/* Current Plan Card */}
                                <div className="sub-card">
                                    <h2 className="h3" style={{ marginBottom: '16px' }}>Current Subscription</h2>

                                    <div>
                                        <div className="sub-row">
                                            <span className="sub-row-label">Plan</span>
                                            <span className="sub-row-val">{currentSubscription.plan?.name}</span>
                                        </div>
                                        <div className="sub-row">
                                            <span className="sub-row-label">Status</span>
                                            <span className={`sub-status ${getStatusColor(currentSubscription.status)}`}>
                                                {currentSubscription.status.charAt(0).toUpperCase() + currentSubscription.status.slice(1)}
                                            </span>
                                        </div>
                                        <div className="sub-row">
                                            <span className="sub-row-label">Period</span>
                                            <span className="sub-row-val" style={{ fontSize: '12px' }}>
                                                {formatDate(currentSubscription.currentPeriodStart)} – {formatDate(currentSubscription.currentPeriodEnd)}
                                            </span>
                                        </div>
                                        <div className="sub-row">
                                            <span className="sub-row-label">Scans This {currentSubscription.billingCycle === "monthly" ? "Month" : "Year"}</span>
                                            <span className="sub-row-val">
                                                {currentSubscription.usage?.scansThisMonth || 0} / {currentSubscription.limits?.scansPerMonth === -1 ? "∞" : currentSubscription.limits?.scansPerMonth}
                                            </span>
                                        </div>
                                    </div>

                                    {!currentSubscription.isTeamMember && (
                                        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--sand)' }}>
                                            {currentSubscription.canManageInStripe !== false ? (
                                                <>
                                                    <button onClick={handleManageSubscription} disabled={actionLoading} className="btn btn-d" style={{ width: '100%', justifyContent: 'center', marginBottom: '6px' }}>
                                                        {actionLoading ? "Opening Portal..." : "Manage Subscription"}
                                                    </button>
                                                    <p style={{ fontSize: '11px', color: 'var(--ink6)', textAlign: 'center' }}>Change plan, update billing, or cancel subscription</p>
                                                </>
                                            ) : (
                                                <div className="sub-portal-note">This subscription is managed locally by an admin — Stripe billing portal is not available.</div>
                                            )}
                                        </div>
                                    )}

                                    {!currentSubscription.isTeamMember && currentSubscription.cancelAtPeriodEnd && (
                                        <div className="sub-cancel-note" style={{ marginTop: '12px' }}>Your subscription will be canceled at the end of the current period.</div>
                                    )}

                                    <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        {currentSubscription.isTeamMember ? (
                                            <>
                                                <button onClick={() => handleLeaveTeam()} disabled={actionLoading} className="btn btn-o" style={{ width: '100%', justifyContent: 'center', color: 'var(--coral)', borderColor: 'var(--coral)' }}>
                                                    {actionLoading ? "Leaving..." : "Leave Team"}
                                                </button>
                                                <p style={{ fontSize: '12px', color: 'var(--ink6)', textAlign: 'center' }}>You're using a team plan. Contact the plan owner to manage the subscription.</p>
                                            </>
                                        ) : (
                                            <>
                                                <button onClick={() => handleCancelSubscription(false)} disabled={actionLoading || currentSubscription.cancelAtPeriodEnd} className="btn btn-o" style={{ width: '100%', justifyContent: 'center', color: 'var(--amber)', borderColor: 'var(--amber)' }}>
                                                    {currentSubscription.cancelAtPeriodEnd ? "Cancellation Scheduled" : "Cancel at Period End"}
                                                </button>
                                                <button onClick={() => handleCancelSubscription(true)} disabled={actionLoading} className="btn btn-o" style={{ width: '100%', justifyContent: 'center', color: 'var(--coral)', borderColor: 'var(--coral)' }}>
                                                    Cancel Immediately
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </div>

                                {/* Team Member Info */}
                                {currentSubscription.isTeamMember && (
                                    <div className="sub-team-info">
                                        <div className="sub-team-icon">
                                            <svg width="26" height="26" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                            </svg>
                                        </div>
                                        <h3 className="h3" style={{ marginBottom: '10px' }}>Team Plan Member</h3>
                                        <p style={{ fontSize: '14px', color: 'var(--ink6)', marginBottom: '10px' }}>
                                            You're using a team plan. Only the plan owner can upgrade, downgrade, or cancel the subscription.
                                        </p>
                                        <p style={{ fontSize: '12px', color: 'var(--ink3)' }}>Contact your team owner if you need changes to the plan or have questions.</p>
                                    </div>
                                )}

                                {/* Team Management */}
                                {currentSubscription && currentSubscription.limits?.maxUsers > 1 && !currentSubscription.isTeamMember && (
                                    <div className="sub-card">
                                        <h2 className="h3" style={{ marginBottom: '16px' }}>Team Management</h2>

                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                                            <div>
                                                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--ink)' }}>Team Members</div>
                                                <div style={{ fontSize: '12px', color: 'var(--ink6)', marginTop: '2px' }}>
                                                    {teamMembers.length} / {currentSubscription.limits.maxUsers === -1 ? "∞" : currentSubscription.limits.maxUsers} members
                                                </div>
                                            </div>
                                            <span className="tag">
                                                {currentSubscription.limits.maxUsers === -1 ? "Unlimited" : currentSubscription.limits.maxUsers - teamMembers.length} slots available
                                            </span>
                                        </div>

                                        <form onSubmit={handleInviteTeamMember} style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                                            <input
                                                type="email"
                                                value={newMemberEmail}
                                                onChange={(e) => setNewMemberEmail(e.target.value)}
                                                placeholder="Enter email address"
                                                className="ss-input"
                                                style={{ flex: 1, minWidth: 0 }}
                                                disabled={teamLoading || (currentSubscription.limits.maxUsers !== -1 && teamMembers.length >= currentSubscription.limits.maxUsers)}
                                            />
                                            <button type="submit" disabled={teamLoading || !newMemberEmail.trim() || (currentSubscription.limits.maxUsers !== -1 && teamMembers.length >= currentSubscription.limits.maxUsers)} className="btn btn-d">
                                                {teamLoading ? "Inviting..." : "Invite"}
                                            </button>
                                        </form>

                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            {teamMembers.length === 0 ? (
                                                <p style={{ fontSize: '13px', color: 'var(--ink6)' }}>No team members yet. Invite someone to get started!</p>
                                            ) : (
                                                teamMembers.map((member, index) => (
                                                    <div key={index} className="sub-member-row">
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <div className="sub-member-avatar">
                                                                <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                                                </svg>
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 500, fontSize: '13px', color: 'var(--ink)' }}>{member.email}</div>
                                                                <div className={`sub-member-status ${member.status === "active" ? "active" : "pending"}`}>
                                                                    {member.status === "active" ? "Active" : "Pending"}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <button onClick={() => handleRemoveTeamMember(member.email)} disabled={teamLoading} className="sub-remove-btn" aria-label={`Remove ${member.email}`}>
                                                            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Scan History */}
                                {!currentSubscription.isTeamMember && (
                                    <div className="sub-card">
                                        <h2 className="h3" style={{ marginBottom: '16px' }}>
                                            {currentSubscription.limits?.maxUsers > 1 ? "Team Scan History" : "Scan History"}
                                        </h2>

                                        {scansLoading ? (
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '24px 0', color: 'var(--ink6)', fontSize: '13px' }}>
                                                <div className="sub-spin" />
                                                {currentSubscription.limits?.maxUsers > 1 ? "Loading team scans..." : "Loading scans..."}
                                            </div>
                                        ) : teamScans.length === 0 ? (
                                            <div className="sub-empty">
                                                <div className="sub-empty-icon">
                                                    <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                    </svg>
                                                </div>
                                                <p style={{ fontSize: '13px', color: 'var(--ink6)' }}>
                                                    {currentSubscription.limits?.maxUsers > 1 ? "No scans performed by team members yet." : "No scans performed yet."}
                                                </p>
                                            </div>
                                        ) : (
                                            <div style={{ maxHeight: '380px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {teamScans.map((scan) => (
                                                    <div key={scan.id} className="sub-scan-row">
                                                        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                                            <div style={{ flex: 1 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                                                                    <span className={`sub-scan-pill ${getScanStatusClass(scan.status)}`}>
                                                                        {scan.status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
                                                                    </span>
                                                                    {scan.isOwner && <span className="sub-scan-pill" style={{ background: 'var(--t05)', color: 'var(--t4)' }}>Owner</span>}
                                                                </div>
                                                                <p style={{ fontSize: '13px', fontWeight: 500, color: 'var(--ink)', margin: '0 0 2px' }}>{scan.url}</p>
                                                                <p style={{ fontSize: '12px', color: 'var(--ink6)', margin: '0 0 6px' }}>by {scan.email}</p>
                                                                <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: 'var(--ink3)', flexWrap: 'wrap' }}>
                                                                    <span>{new Date(scan.createdAt).toLocaleDateString()} at {new Date(scan.createdAt).toLocaleTimeString()}</span>
                                                                    {scan.attachmentCount > 0 && <span>{scan.attachmentCount} file{scan.attachmentCount !== 1 ? 's' : ''} generated</span>}
                                                                </div>
                                                                {scan.failureReason && <p style={{ fontSize: '11px', color: 'var(--coral)', marginTop: '6px' }}>Error: {scan.failureReason}</p>}
                                                            </div>
                                                            <div className={`scan-dot ${getScanDotClass(scan.status)}`} style={{ marginTop: '4px', marginLeft: '12px' }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Available Plans (subscription owners) */}
                                {!currentSubscription.isTeamMember && (
                                    <div className="sub-card" style={{ gridColumn: '1 / -1' }}>
                                        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
                                            <h2 className="h2" style={{ marginBottom: '6px' }}>Available Plans</h2>
                                            <p style={{ fontSize: '14px', color: 'var(--ink6)', marginBottom: '16px' }}>Upgrade or change your subscription</p>
                                            <BillingToggle />
                                        </div>

                                        <div className="g3">
                                            {availablePlans
                                                .filter((plan) => !(plan.type === "one-time" || plan.isOneTime))
                                                .map((plan) => {
                                                    const isCurrentPlan = plan.id === currentSubscription.planId;
                                                    const canUpgrade = !isCurrentPlan && plan.id !== "custom";
                                                    const priceDisplay = plan.contactSales ? null : getPriceDisplay(plan);
                                                    return (
                                                        <div key={plan.id} className={`sub-plan-card${isCurrentPlan ? ' current' : ''}`}>
                                                            <div style={{ marginBottom: '8px' }}>
                                                                {isCurrentPlan && <span className="sub-plan-tag current-tag">Current</span>}
                                                            </div>
                                                            <h3 className="h3" style={{ marginBottom: '6px' }}>{plan.name}</h3>
                                                            <p style={{ fontSize: '13px', color: 'var(--ink6)', marginBottom: '14px' }}>{plan.description}</p>
                                                            <div style={{ marginBottom: '14px' }}>
                                                                {plan.contactSales ? (
                                                                    <div className="sub-plan-price">Contact us</div>
                                                                ) : (
                                                                    <>
                                                                        <div>
                                                                            <span className="sub-plan-price">{priceDisplay.main}</span>
                                                                            <span className="sub-plan-price-suffix">{priceDisplay.suffix}</span>
                                                                        </div>
                                                                        <div className="sub-plan-caption">{priceDisplay.caption}</div>
                                                                    </>
                                                                )}
                                                            </div>
                                                            {plan.limits?.features?.length > 0 && (
                                                                <ul className="sub-feat-list" style={{ marginBottom: '16px', flex: 1 }}>
                                                                    {getDisplayFeatures(plan).map((feature, idx) => (
                                                                        <li key={idx} className="sub-feat-item"><FeatureCheck />{feature}</li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                            {canUpgrade && (
                                                                <button onClick={() => handleUpgradePlan(plan.id, billingCycle)} disabled={actionLoading} className="btn btn-d" style={{ width: '100%', justifyContent: 'center', marginTop: 'auto' }}>
                                                                    {actionLoading ? "Processing..." : "Upgrade Plan"}
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        // No Subscription - Show Plans
                        <div className="sub-no-sub-card">
                            <div style={{ textAlign: 'center', marginBottom: '28px' }}>
                                <h2 className="h2" style={{ marginBottom: '8px' }}>Choose Your Plan</h2>
                                <p style={{ fontSize: '15px', color: 'var(--ink6)', marginBottom: '20px' }}>Select the plan that fits your business needs</p>
                                <BillingToggle />
                            </div>

                            <div className="g3">
                                {availablePlans.map((plan) => {
                                    if (plan.contactSales) {
                                        return (
                                            <div key={plan.id} className="sub-plan-card" style={{ textAlign: 'center' }}>
                                                <div style={{ marginBottom: '10px', color: 'var(--t6)' }}>{SUB_PLAN_ICONS[plan.id] || null}</div>
                                                <h3 className="h3" style={{ marginBottom: '6px' }}>{plan.name}</h3>
                                                <p style={{ fontSize: '13px', color: 'var(--ink6)', marginBottom: '16px', flex: 1 }}>{plan.description}</p>
                                                <a href="/contact" className="btn btn-d" style={{ width: '100%', justifyContent: 'center', marginTop: 'auto' }}>Contact Sales</a>
                                            </div>
                                        );
                                    }

                                    const isOneTimePlan = plan.isOneTime || plan.type === "one-time";
                                    const priceDisplay = isOneTimePlan ? null : getPriceDisplay(plan);

                                    return (
                                        <div key={plan.id} className={`sub-plan-card${plan.popular ? ' popular' : ''}`} style={{ textAlign: 'center' }}>
                                            {plan.popular && <span className="sub-plan-tag popular-tag" style={{ marginBottom: '10px', display: 'inline-block' }}>Most Popular</span>}
                                            <div style={{ marginBottom: '8px', color: 'var(--t6)' }}>{SUB_PLAN_ICONS[plan.id] || null}</div>
                                            <h3 className="h3" style={{ marginBottom: '6px' }}>{plan.name}</h3>
                                            <p style={{ fontSize: '13px', color: 'var(--ink6)', marginBottom: '14px' }}>{plan.description}</p>
                                            <div style={{ marginBottom: '14px' }}>
                                                {isOneTimePlan ? (
                                                    <div className="sub-plan-price">{formatPrice(getCurrentPrice(plan))}</div>
                                                ) : (
                                                    <>
                                                        <div>
                                                            <span className="sub-plan-price">{priceDisplay.main}</span>
                                                            <span className="sub-plan-price-suffix">{priceDisplay.suffix}</span>
                                                        </div>
                                                        <div className="sub-plan-caption">{priceDisplay.caption}</div>
                                                    </>
                                                )}
                                            </div>
                                            {plan.limits?.features?.length > 0 && (
                                                <ul className="sub-feat-list" style={{ marginBottom: '16px', flex: 1, textAlign: 'left' }}>
                                                    {getDisplayFeatures(plan).map((feature, idx) => (
                                                        <li key={idx} className="sub-feat-item"><FeatureCheck />{feature}</li>
                                                    ))}
                                                </ul>
                                            )}
                                            <button onClick={() => handleSubscribe(plan.id, billingCycle)} disabled={actionLoading} className={`btn ${plan.popular ? 'btn-p' : 'btn-d'}`} style={{ width: '100%', justifyContent: 'center', marginTop: 'auto' }}>
                                                {actionLoading ? "Processing..." : "Subscribe Now"}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

const SUB_PLAN_ICONS = {
  starter: <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>,
  pro:     <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/></svg>,
  oneTime: <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>,
  custom:  <svg width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"/></svg>,
};

export default Subscription;
