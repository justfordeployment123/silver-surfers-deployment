import React, { useEffect, useState } from "react";
import { fetchJSON } from "../config/apiBase";

const FAQ = () => {
    const [expandedFaq, setExpandedFaq] = useState(null);
    const [faqData, setFaqData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let active = true;
        (async () => {
            setLoading(true);
            setError("");
            const { ok, data } = await fetchJSON("/faqs?published=true");
            if (!active) return;
            if (ok) {
                const items = Array.isArray(data.items) ? data.items : data.faqs || [];
                setFaqData(items);
                setLoading(false);
            } else {
                setError(data?.error || "Failed to load FAQs");
                setLoading(false);
            }
        })();
        return () => {
            active = false;
        };
    }, []);

    const toggleFaq = (faqId) => {
        setExpandedFaq(expandedFaq === faqId ? null : faqId);
    };

    const navigateToContact = () => {
        window.location.href = "/contact";
    };

    const navigateToHome = () => {
        window.location.href = "/?openScan=1";
    };

    return (
        <>
            <style>{`
                .faq-glow-1 {
                    position: absolute;
                    top: -100px;
                    right: -60px;
                    width: 480px;
                    height: 480px;
                    border-radius: 50%;
                    background: radial-gradient(circle, rgba(29,158,117,0.18) 0%, transparent 70%);
                    pointer-events: none;
                }
                .faq-glow-2 {
                    position: absolute;
                    bottom: -80px;
                    left: -40px;
                    width: 300px;
                    height: 300px;
                    border-radius: 50%;
                    background: radial-gradient(circle, rgba(29,158,117,0.12) 0%, transparent 70%);
                    pointer-events: none;
                }
                .faq-list {
                    max-width: 820px;
                    margin: 0 auto;
                }
                .faq-item {
                    border-bottom: 1px solid var(--sandd);
                }
                .faq-item:first-child {
                    border-top: 1px solid var(--sandd);
                }
                .faq-q-btn {
                    /* button{} inherits font-family but not font-size; without
                       this the element computes to the ~13.3px UA default and
                       fails text-font-audit. Children set their own 16px, so
                       nothing moves visually. */
                    font-size: 16px;
                    width: 100%;
                    background: none;
                    border: none;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 16px;
                    padding: 20px 4px;
                    text-align: left;
                    font-family: var(--ff);
                }
                .faq-q-btn:focus-visible {
                    outline: 2px solid var(--t4);
                    outline-offset: 2px;
                    border-radius: 4px;
                }
                .faq-q-inner {
                    display: flex;
                    align-items: center;
                    gap: 14px;
                    flex: 1;
                }
                .faq-q-num {
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    background: var(--t05);
                    color: var(--t4);
                    font-size: 16px;
                    font-weight: 600;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    flex-shrink: 0;
                    font-family: var(--ff);
                }
                .faq-q-text {
                    font-size: 16px;
                    font-weight: 500;
                    color: var(--ink);
                    line-height: 1.5;
                }
                .faq-chevron {
                    color: var(--t4);
                    flex-shrink: 0;
                    display: flex;
                    transition: transform 0.25s ease;
                }
                .faq-chevron.open {
                    transform: rotate(180deg);
                }
                .faq-answer-wrap {
                    padding: 0 4px 20px 42px;
                }
                .faq-answer-text {
                    font-size: 16px;
                    color: var(--ink6);
                    line-height: 1.75;
                }
                .faq-status {
                    text-align: center;
                    padding: 40px 0;
                    font-size: 16px;
                    color: var(--ink6);
                }
                .faq-status.err { color: var(--coral); }
            `}</style>

            <div>

                {/* ── Hero ─────────────────────────────────── */}
                <div className="pg-hero">
                    <div className="faq-glow-1" aria-hidden="true" />
                    <div className="faq-glow-2" aria-hidden="true" />
                    <div className="wrap" style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
                        <p className="eyebrow eyebrow--light" style={{ justifyContent: 'center' }}>FAQ</p>
                        <h1 className="h1" style={{ color: '#fff' }}>Frequently Asked Questions</h1>
                        <p className="lead" style={{ color: 'rgba(255, 255, 255, 0.75)', maxWidth: '560px', margin: '0 auto' }}>
                            Find answers to the most frequently asked questions about SilverSurfers
                        </p>
                    </div>
                </div>

                {/* ── FAQ List ──────────────────────────────── */}
                <section className="sec">
                    <div className="wrap">
                        <div className="faq-list">
                            {loading && <p className="faq-status">Loading FAQs…</p>}
                            {error && <p className="faq-status err">{error}</p>}
                            {!loading && !error && faqData.map((faq, idx) => {
                                const id = faq._id || idx;
                                const isOpen = expandedFaq === id;
                                return (
                                    <div key={id} className="faq-item">
                                        <button
                                            type="button"
                                            className="faq-q-btn"
                                            onClick={() => toggleFaq(id)}
                                            aria-expanded={isOpen}
                                        >
                                            <div className="faq-q-inner">
                                                <span className="faq-q-num" aria-hidden="true">
                                                    {Number(faq.order ?? idx) + 1}
                                                </span>
                                                <span className="faq-q-text">{faq.question}</span>
                                            </div>
                                            <span className={`faq-chevron${isOpen ? ' open' : ''}`} aria-hidden="true">
                                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                                    <polyline points="6 9 12 15 18 9" />
                                                </svg>
                                            </span>
                                        </button>
                                        {isOpen && (
                                            <div className="faq-answer-wrap">
                                                <p className="faq-answer-text">{faq.answer}</p>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {!loading && !error && faqData.length === 0 && (
                                <p className="faq-status">No FAQs published yet.</p>
                            )}
                        </div>
                    </div>
                </section>

                {/* ── Helpful Resources ─────────────────────── */}
                <section className="sec-sand">
                    <div className="wrap">
                        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                            <p className="eyebrow">Resources</p>
                            <h2 className="h2">Helpful Resources</h2>
                            <p className="sub">Dive deeper into the digital experience.</p>
                        </div>
                        <div style={{ maxWidth: '360px', margin: '0 auto' }}>
                            <div className="card">
                                <div className="card-bar" />
                                <div style={{ width: '44px', height: '44px', background: 'var(--t05)', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                                    <svg width="20" height="20" fill="none" stroke="var(--t4)" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                </div>
                                <h3 className="h3" style={{ marginBottom: '8px' }}>SilverSurfers Blog</h3>
                                <p style={{ fontSize: '16px', color: 'var(--ink6)', lineHeight: '1.65', marginBottom: '16px' }}>
                                    See how we've helped businesses improve their digital platforms
                                </p>
                                <button
                                    type="button"
                                    onClick={() => (window.location.href = "/blog")}
                                    className="btn btn-o"
                                >
                                    Read Blog
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ── CTA ──────────────────────────────────── */}
                <section className="cta-sec">
                    <div className="wrap" style={{ textAlign: 'center' }}>
                        <h2 className="h2" style={{ color: '#fff', marginBottom: '16px' }}>
                            Ready to Get Started?
                        </h2>
                        <p className="lead" style={{ color: 'rgba(255, 255, 255, 0.75)', marginBottom: '36px', maxWidth: '560px', marginLeft: 'auto', marginRight: 'auto' }}>
                            Join the growing community of businesses elevating their digital experience
                            with SilverSurfers.ai
                        </p>
                        <div className="btn-row" style={{ justifyContent: 'center' }}>
                            <button
                                type="button"
                                onClick={navigateToHome}
                                className="btn btn-p"
                            >
                                Get Quick Scan Report
                            </button>
                            <button
                                type="button"
                                onClick={navigateToContact}
                                className="btn btn-g"
                            >
                                Contact Us
                            </button>
                        </div>
                    </div>
                </section>

            </div>
        </>
    );
};

export default FAQ;
