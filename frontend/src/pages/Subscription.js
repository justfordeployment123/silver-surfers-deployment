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
    const [billingCycle] = useState("yearly"); // Always yearly - no monthly option
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const selectedPlan = params.get("plan");
    const selectedCycle = "yearly"; // Always yearly

    // Scroll to top when error or success is set
    useEffect(() => {
        if (error || success) {
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    }, [error, success]);

    // Helper functions for pricing
    const getCurrentPrice = (plan) => {
        // Handle one-time plans
        if (plan.type === "one-time" || plan.isOneTime) {
            return plan.price;
        }
        return plan.yearlyPrice; // Always yearly
    };

    useEffect(() => {
        loadData();
    }, []);

    // Handle upgrade from URL parameters
    useEffect(() => {
        if (selectedPlan && currentSubscription && !loading) {
            handleUpgradePlan(selectedPlan, selectedCycle);
        }
    }, [selectedPlan, currentSubscription, loading]);

    const handleUpgradePlan = async (planId, cycle) => {
        try {
            setActionLoading(true);
            const result = await upgradeSubscription(planId, cycle);

            if (result.error) {
                setError(result.error);
                setActionLoading(false);
            } else if (result.url) {
                // Redirect to Stripe checkout for upgrade (allows discount codes)
                window.location.href = result.url;
            }
        } catch (err) {
            setError("Failed to initiate upgrade");
            setActionLoading(false);
        }
    };

    const loadData = async () => {
        try {
            setLoading(true);
            const [subscriptionResult, plansResult] = await Promise.all([getSubscription(), getSubscriptionPlans()]);

            if (subscriptionResult.error) {
                setError(subscriptionResult.error);
            } else {
                setCurrentSubscription(subscriptionResult.subscription);

                // Load team members and scans if user has active subscription
                if (subscriptionResult.subscription) {
                    loadTeamMembers();
                    // Load team scans if user is subscription owner (not team member)
                    if (!subscriptionResult.subscription.isTeamMember) {
                        loadTeamScans();
                    }
                }
            }

            if (plansResult.plans) {
                setAvailablePlans(plansResult.plans);
            }

            // If user came from Services page with plan selection, start checkout
            if (selectedPlan && !subscriptionResult.subscription) {
                handleSubscribe(selectedPlan, selectedCycle);
            }
        } catch (err) {
            setError("Failed to load subscription data");
        } finally {
            setLoading(false);
        }
    };

    const loadTeamMembers = async () => {
        try {
            const result = await getTeamMembers();
            if (result.error) {
                console.error("Failed to load team members:", result.error);
            } else {
                setTeamMembers(result.teamMembers || []);
            }
        } catch (err) {
            console.error("Failed to load team members:", err);
        }
    };

    const loadTeamScans = async () => {
        try {
            setScansLoading(true);
            const result = await getTeamScans();
            if (result.error) {
                console.error("Failed to load team scans:", result.error);
            } else {
                setTeamScans(result.scans || []);
            }
        } catch (err) {
            console.error("Failed to load team scans:", err);
        } finally {
            setScansLoading(false);
        }
    };

    const handleSubscribe = async (planId, billingCycle = "yearly") => {
        try {
            setActionLoading(true);
            setError("");
            const result = await createCheckoutSession(planId, billingCycle);

            if (result.error) {
                setError(result.error);
            } else if (result.url) {
                window.location.href = result.url;
            }
        } catch (err) {
            setError("Failed to create checkout session");
        } finally {
            setActionLoading(false);
        }
    };

    const handleManageSubscription = async () => {
        try {
            setActionLoading(true);
            setError("");
            const result = await createPortalSession();

            if (result.error) {
                setError(result.error);
            } else {
                // Redirect to Stripe Customer Portal
                window.location.href = result.url;
            }
        } catch (err) {
            setError("Failed to open subscription management portal");
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancelSubscription = async (immediate = false) => {
        if (!window.confirm(`Are you sure you want to ${immediate ? "cancel immediately" : "cancel at period end"}?`)) {
            return;
        }

        try {
            setActionLoading(true);
            setError("");
            const result = await cancelSubscription(!immediate);

            if (result.error) {
                setError(result.error);
            } else {
                setSuccess(result.message);
                setTimeout(() => {
                    setSuccess("");
                    loadData();
                }, 3000);
            }
        } catch (err) {
            setError("Failed to cancel subscription");
        } finally {
            setActionLoading(false);
        }
    };

    const handleLeaveTeam = async () => {
        if (!window.confirm("Are you sure you want to leave this team? You will lose access to the subscription benefits.")) {
            return;
        }

        try {
            setActionLoading(true);
            setError("");
            const result = await leaveTeam();

            if (result.error) {
                setError(result.error);
            } else {
                setSuccess("Successfully left the team. You will be redirected to the subscription page.");
                setTimeout(() => {
                    loadData();
                }, 2000);
            }
        } catch (err) {
            setError("Failed to leave team");
        } finally {
            setActionLoading(false);
        }
    };

    const formatPrice = (price) => {
        if (!price) return "Contact us";
        const amount = (price / 100).toFixed(0);
        return `$${parseInt(amount).toLocaleString()}`;
    };

    const formatDate = (date) => {
        return new Date(date).toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        });
    };

    const getStatusColor = (status) => {
        switch (status) {
            case "active":
                return "text-green-600 bg-green-100";
            case "trialing":
                return "text-blue-600 bg-blue-100";
            case "past_due":
                return "text-yellow-600 bg-yellow-100";
            case "canceled":
                return "text-red-600 bg-red-100";
            default:
                return "text-gray-600 bg-gray-100";
        }
    };

    const handleInviteTeamMember = async (e) => {
        e.preventDefault();
        if (!newMemberEmail.trim()) return;

        try {
            setTeamLoading(true);
            setError("");
            const result = await inviteTeamMember(newMemberEmail.trim());

            if (result.error) {
                setError(result.error);
            } else {
                setSuccess("Team member invited successfully!");
                setNewMemberEmail("");
                loadTeamMembers(); // Refresh team list
                setTimeout(() => setSuccess(""), 3000);
            }
        } catch (err) {
            setError("Failed to invite team member");
        } finally {
            setTeamLoading(false);
        }
    };

    const handleRemoveTeamMember = async (email) => {
        if (!window.confirm(`Are you sure you want to remove ${email} from your team?`)) {
            return;
        }

        try {
            setTeamLoading(true);
            setError("");
            const result = await removeTeamMember(email);

            if (result.error) {
                setError(result.error);
            } else {
                setSuccess("Team member removed successfully!");
                loadTeamMembers(); // Refresh team list
                setTimeout(() => setSuccess(""), 3000);
            }
        } catch (err) {
            setError("Failed to remove team member");
        } finally {
            setTeamLoading(false);
        }
    };

    // Loading Skeleton Component
    const LoadingSkeleton = () => (
        <div className="min-h-screen bg-gradient-to-br from-blue-950 via-green-950 via-teal-950 to-cyan-900 pt-24 pb-10 px-4">
            <div className="max-w-6xl mx-auto">
                {/* Header Skeleton */}
                <div className="text-center mb-12">
                    <div className="h-10 bg-white/10 rounded-lg w-96 mx-auto mb-4 animate-pulse"></div>
                    <div className="h-6 bg-white/10 rounded-lg w-64 mx-auto animate-pulse"></div>
                </div>

                {/* Main Content Skeleton */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Card 1 Skeleton */}
                    <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-8 shadow-xl animate-pulse">
                        <div className="h-8 bg-white/10 rounded w-48 mb-6"></div>
                        <div className="space-y-4">
                            <div className="h-4 bg-white/10 rounded w-full"></div>
                            <div className="h-4 bg-white/10 rounded w-5/6"></div>
                            <div className="h-4 bg-white/10 rounded w-4/6"></div>
                        </div>
                        <div className="mt-6 h-10 bg-white/10 rounded-lg w-32"></div>
                    </div>

                    {/* Card 2 Skeleton */}
                    <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-8 shadow-xl animate-pulse">
                        <div className="h-8 bg-white/10 rounded w-48 mb-6"></div>
                        <div className="space-y-4">
                            <div className="h-4 bg-white/10 rounded w-full"></div>
                            <div className="h-4 bg-white/10 rounded w-5/6"></div>
                            <div className="h-4 bg-white/10 rounded w-4/6"></div>
                        </div>
                        <div className="mt-6 h-10 bg-white/10 rounded-lg w-32"></div>
                    </div>
                </div>

                {/* Plans Skeleton */}
                <div className="mt-8">
                    <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-8 shadow-xl animate-pulse">
                        <div className="h-8 bg-white/10 rounded w-56 mb-6"></div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[1, 2, 3].map((i) => (
                                <div key={i} className="bg-white/5 rounded-2xl p-6">
                                    <div className="h-6 bg-white/10 rounded w-32 mb-4"></div>
                                    <div className="h-10 bg-white/10 rounded w-24 mb-4"></div>
                                    <div className="space-y-2 mb-6">
                                        <div className="h-3 bg-white/10 rounded w-full"></div>
                                        <div className="h-3 bg-white/10 rounded w-5/6"></div>
                                        <div className="h-3 bg-white/10 rounded w-4/6"></div>
                                    </div>
                                    <div className="h-10 bg-white/10 rounded-lg"></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Loading Text */}
                <div className="text-center mt-8">
                    <div className="inline-flex items-center gap-3 text-white/80">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span className="text-lg">Loading your subscription details...</span>
                    </div>
                </div>
            </div>
        </div>
    );

    const getPlanButtonInfo = (plan) => {
        const isCurrentPlan = currentSubscription && currentSubscription.planId === plan.id;
        const hasActiveSubscription = currentSubscription && currentSubscription.status === "active";
        const isTeamMember = currentSubscription && currentSubscription.isTeamMember;

        if (plan.contactSales) {
            return {
                text: "Contact Sales",
                link: "/contact",
                isDisabled: false,
            };
        }

        // Handle one-time purchases - if user has scans, go to /checkout, else Stripe checkout
        if (plan.isOneTime || plan.type === "one-time") {
            const hasOneTimeScans = currentSubscription && currentSubscription.oneTimeScans > 0;
            return {
                text: hasOneTimeScans ? "Use One-Time Report" : "Get Report",
                link: hasOneTimeScans ? "/checkout" : "/stripe-checkout",
                isDisabled: false,
            };
        }

        if (isCurrentPlan && hasActiveSubscription) {
            return {
                text: "Start Audit",
                link: "/checkout",
                isDisabled: false,
            };
        }

        if (hasActiveSubscription && !isCurrentPlan) {
            if (isTeamMember) {
                return {
                    text: "Contact Owner",
                    link: "/subscription",
                    isDisabled: false,
                };
            }

            return {
                text: "Upgrade Plan",
                link: `/subscription?plan=${plan.id}&cycle=${billingCycle}`,
                isDisabled: false,
            };
        }

        if (isTeamMember) {
            return {
                text: "Contact Owner",
                link: "/subscription",
                isDisabled: false,
            };
        }

        return {
            text: "Subscribe Now",
            link: `/subscription?plan=${plan.id}&cycle=${billingCycle}`,
            isDisabled: false,
        };
    };

    if (loading) {
        return <LoadingSkeleton />;
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-950 via-green-950 via-teal-950 to-cyan-900 pt-24 pb-10 px-4">
            <div className="max-w-6xl mx-auto">
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-white mb-4">Subscription Management</h1>
                    <p className="text-xl text-gray-200">Manage your SilverSurfers subscription</p>
                </div>

                {error && <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">{error}</div>}

                {success && <div className="mb-6 p-4 bg-green-100 border border-green-400 text-green-700 rounded-lg">{success}</div>}

                {currentSubscription ? (
                    <>
                        {/* Start Audit Button for Active Subscribers */}
                        {currentSubscription.status === "active" && (
                            <div className="mb-8 text-center">
                                <div
                                    className={`bg-white rounded-2xl p-6 shadow-xl border-2 ${currentSubscription.isTeamMember ? "border-yellow-300" : "border-green-200"}`}
                                >
                                    {currentSubscription.isTeamMember && (
                                        <div className="mb-4 inline-block px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-semibold">
                                            👥 Team Member
                                        </div>
                                    )}
                                    <h3 className="text-xl font-bold text-gray-900 mb-4">Ready to Start Your Audit?</h3>
                                    <p className="text-gray-600 mb-6">
                                        You have {currentSubscription.isTeamMember ? "team access to an" : "an"} active subscription. Start
                                        auditing your website now!
                                    </p>
                                    <button
                                        onClick={() => navigate("/checkout")}
                                        className="bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white font-semibold px-8 py-3 rounded-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
                                    >
                                        Start Full Audit
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Current Subscription */}
                        <div
                            className={`grid grid-cols-1 gap-8 ${currentSubscription.limits?.maxUsers > 1 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}
                        >
                            <div className="bg-white rounded-3xl p-6 shadow-xl">
                                <h2 className="text-2xl font-bold text-gray-900 mb-6">Current Subscription</h2>

                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-700">Plan:</span>
                                        <span className="font-semibold text-gray-900">{currentSubscription.plan?.name}</span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-700">Status:</span>
                                        <span
                                            className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(currentSubscription.status)}`}
                                        >
                                            {currentSubscription.status.charAt(0).toUpperCase() + currentSubscription.status.slice(1)}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-700">Current Period:</span>
                                        <span className="font-semibold text-gray-900 text-sm">
                                            {formatDate(currentSubscription.currentPeriodStart)} -{" "}
                                            {formatDate(currentSubscription.currentPeriodEnd)}
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        <span className="text-gray-700">Scans This Year:</span>
                                        <span className="font-semibold text-gray-900">
                                            {currentSubscription.usage?.scansThisMonth || 0} /{" "}
                                            {currentSubscription.limits?.scansPerMonth === -1
                                                ? "∞"
                                                : currentSubscription.limits?.scansPerMonth}
                                        </span>
                                    </div>

                                    {/* Only show subscription management for subscription owners, not team members */}
                                    {!currentSubscription.isTeamMember && (
                                        <>
                                            <div className="pt-4 border-t border-gray-200">
                                                <button
                                                    onClick={handleManageSubscription}
                                                    disabled={actionLoading}
                                                    className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors"
                                                >
                                                    {actionLoading ? "Opening Portal..." : "Manage Subscription"}
                                                </button>
                                                <p className="text-xs text-gray-500 mt-2 text-center">
                                                    Change plan, update billing, or cancel subscription
                                                </p>
                                            </div>

                                            {currentSubscription.cancelAtPeriodEnd && (
                                                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                                    <p className="text-yellow-800 text-sm">
                                                        Your subscription will be canceled at the end of the current period.
                                                    </p>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* Show different options for subscription owners vs team members */}
                                {currentSubscription.isTeamMember ? (
                                    <div className="mt-8">
                                        <button
                                            onClick={() => handleLeaveTeam()}
                                            disabled={actionLoading}
                                            className="w-full py-2 px-4 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors"
                                        >
                                            {actionLoading ? "Leaving..." : "Leave Team"}
                                        </button>
                                        <p className="text-sm text-gray-600 mt-2 text-center">
                                            You're using a team plan. Contact the plan owner to manage the subscription.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="mt-8 space-y-3">
                                        <button
                                            onClick={() => handleCancelSubscription(false)}
                                            disabled={actionLoading || currentSubscription.cancelAtPeriodEnd}
                                            className="w-full py-2 px-4 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors"
                                        >
                                            {currentSubscription.cancelAtPeriodEnd ? "Cancellation Scheduled" : "Cancel at Period End"}
                                        </button>

                                        <button
                                            onClick={() => handleCancelSubscription(true)}
                                            disabled={actionLoading}
                                            className="w-full py-2 px-4 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors"
                                        >
                                            Cancel Immediately
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Team Member Info - Only for team members */}
                            {currentSubscription.isTeamMember && (
                                <div className="bg-blue-50 rounded-3xl p-8 shadow-xl border border-blue-200">
                                    <div className="text-center">
                                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                                                />
                                            </svg>
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900 mb-2">Team Plan Member</h3>
                                        <p className="text-gray-600 mb-4">
                                            You're using a team plan. Only the plan owner can upgrade, downgrade, or cancel the
                                            subscription.
                                        </p>
                                        <p className="text-sm text-gray-500">
                                            Contact your team owner if you need changes to the plan or have questions.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Team Management Section - Only for subscription owners */}
                            {currentSubscription && currentSubscription.limits?.maxUsers > 1 && !currentSubscription.isTeamMember && (
                                <div className="bg-white rounded-3xl p-6 shadow-xl">
                                    <h2 className="text-2xl font-bold text-gray-900 mb-6">Team Management</h2>

                                    <div className="mb-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <div>
                                                <h3 className="font-semibold text-gray-900">Team Members</h3>
                                                <p className="text-sm text-gray-600">
                                                    {teamMembers.length} /{" "}
                                                    {currentSubscription.limits.maxUsers === -1 ? "∞" : currentSubscription.limits.maxUsers}{" "}
                                                    members
                                                </p>
                                            </div>
                                            <div className="text-sm text-gray-500">
                                                {currentSubscription.limits.maxUsers === -1
                                                    ? "Unlimited"
                                                    : currentSubscription.limits.maxUsers - teamMembers.length}{" "}
                                                slots available
                                            </div>
                                        </div>

                                        {/* Add Team Member Form */}
                                        <form onSubmit={handleInviteTeamMember} className="flex gap-2 mb-4">
                                            <input
                                                type="email"
                                                value={newMemberEmail}
                                                onChange={(e) => setNewMemberEmail(e.target.value)}
                                                placeholder="Enter email address"
                                                className="w-full min-w-0 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
                                                disabled={
                                                    teamLoading ||
                                                    (currentSubscription.limits.maxUsers !== -1 &&
                                                        teamMembers.length >= currentSubscription.limits.maxUsers)
                                                }
                                            />
                                            <button
                                                type="submit"
                                                disabled={
                                                    teamLoading ||
                                                    !newMemberEmail.trim() ||
                                                    (currentSubscription.limits.maxUsers !== -1 &&
                                                        teamMembers.length >= currentSubscription.limits.maxUsers)
                                                }
                                                className="px-6 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors"
                                            >
                                                {teamLoading ? "Inviting..." : "Invite"}
                                            </button>
                                        </form>

                                        {/* Team Members List */}
                                        <div className="space-y-2">
                                            {teamMembers.length === 0 ? (
                                                <p className="text-gray-500 text-sm">No team members yet. Invite someone to get started!</p>
                                            ) : (
                                                teamMembers.map((member, index) => (
                                                    <div
                                                        key={index}
                                                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                                                    >
                                                        <div className="flex items-center">
                                                            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center mr-3">
                                                                <svg
                                                                    className="w-4 h-4 text-blue-600"
                                                                    fill="none"
                                                                    stroke="currentColor"
                                                                    viewBox="0 0 24 24"
                                                                >
                                                                    <path
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                        strokeWidth={2}
                                                                        d="M16 7a4 4 0 11-8 0 4 4 0 018 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                                                                    />
                                                                </svg>
                                                            </div>
                                                            <div>
                                                                <div className="font-medium text-gray-900">{member.email}</div>
                                                                <div
                                                                    className={`text-xs ${member.status === "active" ? "text-green-600" : "text-yellow-600"}`}
                                                                >
                                                                    {member.status === "active" ? "Active" : "Pending"}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <button
                                                            onClick={() => handleRemoveTeamMember(member.email)}
                                                            disabled={teamLoading}
                                                            className="text-red-500 hover:text-red-700 disabled:text-gray-400 transition-colors"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    strokeWidth={2}
                                                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                                                />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Scan History Section - Only for subscription owners */}
                            {!currentSubscription.isTeamMember && (
                                <div className="bg-white rounded-3xl p-6 shadow-xl">
                                    <h2 className="text-2xl font-bold text-gray-900 mb-6">
                                        {currentSubscription.limits?.maxUsers > 1 ? "Team Scan History" : "Scan History"}
                                    </h2>

                                    {scansLoading ? (
                                        <div className="flex items-center justify-center py-8">
                                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                                            <span className="ml-3 text-gray-600">
                                                {currentSubscription.limits?.maxUsers > 1 ? "Loading team scans..." : "Loading scans..."}
                                            </span>
                                        </div>
                                    ) : teamScans.length === 0 ? (
                                        <div className="text-center py-8">
                                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <svg
                                                    className="w-8 h-8 text-gray-400"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth={2}
                                                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                                    />
                                                </svg>
                                            </div>
                                            <p className="text-gray-500">
                                                {currentSubscription.limits?.maxUsers > 1
                                                    ? "No scans performed by team members yet."
                                                    : "No scans performed yet."}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="max-h-96 overflow-y-auto space-y-4">
                                            {teamScans.map((scan) => (
                                                <div
                                                    key={scan.id}
                                                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
                                                >
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <span
                                                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                                        scan.status === "completed"
                                                                            ? "bg-green-100 text-green-800"
                                                                            : scan.status === "completed_with_warnings"
                                                                              ? "bg-amber-100 text-amber-800"
                                                                              : scan.status === "failed"
                                                                                ? "bg-red-100 text-red-800"
                                                                                : scan.status === "processing"
                                                                                  ? "bg-yellow-100 text-yellow-800"
                                                                                  : "bg-gray-100 text-gray-800"
                                                                    }`}
                                                                >
                                                                    {scan.status
                                                                        .replace(/_/g, " ")
                                                                        .replace(/\b\w/g, (character) => character.toUpperCase())}
                                                                </span>
                                                                {scan.isOwner && (
                                                                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                                                        Owner
                                                                    </span>
                                                                )}
                                                            </div>

                                                            <div className="mb-2">
                                                                <p className="text-sm font-medium text-gray-900 truncate">{scan.url}</p>
                                                                <p className="text-sm text-gray-600">by {scan.email}</p>
                                                            </div>

                                                            <div className="flex items-center gap-4 text-xs text-gray-500">
                                                                <span>
                                                                    {new Date(scan.createdAt).toLocaleDateString()} at{" "}
                                                                    {new Date(scan.createdAt).toLocaleTimeString()}
                                                                </span>
                                                                {scan.attachmentCount > 0 && (
                                                                    <span>
                                                                        {scan.attachmentCount} file{scan.attachmentCount !== 1 ? "s" : ""}{" "}
                                                                        generated
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {scan.failureReason && (
                                                                <p className="text-xs text-red-600 mt-2">Error: {scan.failureReason}</p>
                                                            )}
                                                        </div>

                                                        <div className="ml-4 flex-shrink-0">
                                                            {scan.status === "completed" && (
                                                                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                                            )}
                                                            {scan.status === "completed_with_warnings" && (
                                                                <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                                                            )}
                                                            {scan.status === "failed" && (
                                                                <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                                                            )}
                                                            {scan.status === "processing" && (
                                                                <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                                                            )}
                                                            {scan.status === "queued" && (
                                                                <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Available Plans Section - Only for subscription owners */}
                            {!currentSubscription.isTeamMember && (
                                <div className="col-span-full bg-white rounded-3xl p-6 shadow-xl">
                                    <div className="text-center mb-8">
                                        <h2 className="text-2xl font-bold text-gray-900 mb-4">Available Plans</h2>
                                        <p className="text-lg text-gray-600 mb-6">Upgrade or change your subscription</p>
                                    </div>

                                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                                        {availablePlans
                                            .filter((plan) => !(plan.type === "one-time" || plan.isOneTime))
                                            .map((plan) => {
                                                const isCurrentPlan = plan.id === currentSubscription.planId;
                                                const canUpgrade = !isCurrentPlan && plan.id !== "custom";

                                                return (
                                                    <div
                                                        key={plan.id}
                                                        className={`p-6 border-2 rounded-xl ${isCurrentPlan ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}
                                                    >
                                                        <div className="flex items-center justify-between mb-3">
                                                            <h3 className="text-xl font-bold text-gray-900">{plan.name}</h3>
                                                            {isCurrentPlan && (
                                                                <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded-full">
                                                                    Current
                                                                </span>
                                                            )}
                                                        </div>

                                                        <p className="text-sm text-gray-600 mb-4">{plan.description}</p>

                                                        {/* Pricing Section */}
                                                        <div className="mb-4">
                                                            <div className="font-bold text-2xl text-gray-900 mb-1">
                                                                {formatPrice(getCurrentPrice(plan))}
                                                            </div>
                                                            <div className="text-sm text-gray-500 mb-2">per year</div>
                                                        </div>

                                                        {/* Features List */}
                                                        {plan.limits.features && plan.limits.features.length > 0 && (
                                                            <div className="mb-4">
                                                                <ul className="space-y-2">
                                                                    {plan.limits.features.map((feature, idx) => (
                                                                        <li key={idx} className="flex items-start text-sm text-gray-700">
                                                                            <svg
                                                                                className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0"
                                                                                fill="currentColor"
                                                                                viewBox="0 0 20 20"
                                                                            >
                                                                                <path
                                                                                    fillRule="evenodd"
                                                                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                                                    clipRule="evenodd"
                                                                                />
                                                                            </svg>
                                                                            {feature}
                                                                        </li>
                                                                    ))}
                                                                </ul>
                                                            </div>
                                                        )}

                                                        {canUpgrade && (
                                                            <button
                                                                onClick={() => handleUpgradePlan(plan.id, billingCycle)}
                                                                disabled={actionLoading}
                                                                className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors"
                                                            >
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
                    <div className="bg-white rounded-3xl p-6 shadow-xl">
                        <div className="text-center mb-8">
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">Choose Your Plan</h2>
                            <p className="text-lg text-gray-600 mb-6">Select the plan that fits your business needs</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {availablePlans.map((plan) => {
                                if (plan.contactSales) {
                                    return (
                                        <div
                                            key={plan.id}
                                            className="p-6 border-2 border-gray-200 rounded-xl text-center flex flex-col h-full"
                                        >
                                            <div className="flex-grow flex flex-col">
                                                <div className="text-4xl mb-4">{plan.icon}</div>
                                                <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                                                <p className="text-gray-700 mb-4">{plan.description}</p>
                                            </div>
                                            <div className="mt-auto">
                                                <a
                                                    href="/contact"
                                                    className="inline-block px-6 py-3 bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold rounded-lg hover:shadow-lg transition-all"
                                                >
                                                    Contact Sales
                                                </a>
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        key={plan.id}
                                        className={`p-6 border-2 rounded-xl text-center flex flex-col h-full ${plan.popular ? "border-blue-500 bg-blue-50" : "border-gray-200"}`}
                                    >
                                        <div className="flex-grow flex flex-col">
                                            {plan.popular && (
                                                <div className="text-xs bg-blue-500 text-white px-3 py-1 rounded-full mb-4 inline-block">
                                                    Most Popular
                                                </div>
                                            )}

                                            <div className="text-4xl mb-4">{plan.icon}</div>
                                            <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                                            <p className="text-gray-700 mb-4">{plan.description}</p>

                                            <div className="mb-4">
                                                {/* Current Price */}
                                                <div className="text-3xl font-bold text-gray-900">{formatPrice(getCurrentPrice(plan))}</div>

                                                {/* Only show "per year" for subscription plans, not one-time */}
                                                {!(plan.isOneTime || plan.type === "one-time") && (
                                                    <div className="text-sm text-gray-700">per year</div>
                                                )}
                                            </div>

                                            {/* Features List - matching Services page */}
                                            {plan.limits && plan.limits.features && plan.limits.features.length > 0 && (
                                                <div className="mb-4">
                                                    <ul className="space-y-2 text-left">
                                                        {plan.limits.features.map((feature, idx) => (
                                                            <li key={idx} className="flex items-start text-sm text-gray-700">
                                                                <svg
                                                                    className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0"
                                                                    fill="currentColor"
                                                                    viewBox="0 0 20 20"
                                                                >
                                                                    <path
                                                                        fillRule="evenodd"
                                                                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                                                        clipRule="evenodd"
                                                                    />
                                                                </svg>
                                                                {feature}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                        </div>

                                        <div className="mt-auto">
                                            <button
                                                onClick={() => handleSubscribe(plan.id, billingCycle)}
                                                disabled={actionLoading}
                                                className={`w-full py-3 px-6 font-semibold rounded-lg transition-all ${
                                                    plan.popular
                                                        ? "bg-gradient-to-r from-blue-500 to-green-500 hover:shadow-lg text-white"
                                                        : "bg-gray-900 hover:bg-gray-800 text-white"
                                                }`}
                                            >
                                                {actionLoading ? "Processing..." : "Subscribe Now"}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Subscription;
