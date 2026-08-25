import { sendDirectMail } from "../audits/report-delivery.ts";

export interface AuthEmailResult {
    success: boolean;
    error?: string;
    accepted?: string[];
    rejected?: string[];
    response?: string;
    messageId?: string;
}

interface AuthEmailContent {
    html: string;
    text: string;
}

function resolveFrontendUrl(frontendUrl: string = process.env.FRONTEND_URL || "http://localhost:3000"): string {
    return frontendUrl.replace(/\/+$/, "");
}

export function buildVerificationLink(token: string, frontendUrl?: string): string {
    return `${resolveFrontendUrl(frontendUrl)}/verify-email?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetLink(token: string, frontendUrl?: string): string {
    return `${resolveFrontendUrl(frontendUrl)}/reset-password?token=${encodeURIComponent(token)}`;
}

function escapeHtml(value: unknown): string {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Same table-based navy-header/blue-button shell as the audit report email
 * (buildAuditReportEmailBody in report-delivery.ts) and the monitoring alert
 * emails (wrapMonitoringEmail) — previously this was a one-off rounded card
 * with a per-email accent color (blue for verify, red for reset), which read
 * as a different product from the report/monitoring emails. One consistent
 * header across every SilverSurfers email is what actually reads as
 * "not spam", not any one email's own color choice.
 */
function wrapAuthEmail(options: {
    bannerTitle: string;
    heading: string;
    body: string;
    actionLabel: string;
    actionUrl: string;
    footer: string;
    token: string;
}): AuthEmailContent {
    const generatedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
            <title>${escapeHtml(options.bannerTitle)}</title>
        </head>
        <body style="margin:0;padding:0;background:#ffffff;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border-collapse:collapse;margin:0;padding:0;">
                <tr>
                    <td align="center" style="padding:16px 12px;">
                        <table role="presentation" width="640" cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:640px;max-width:640px;">
                            <tr>
                                <td align="center" style="background:#102447;padding:22px 24px 24px 24px;">
                                    <div style="color:#b9c8df;font-family:Arial,sans-serif;font-size:9px;font-weight:bold;letter-spacing:.7px;line-height:12px;text-transform:uppercase;">Silversurfers AI - The Authority on Silver Digital Readiness</div>
                                    <div style="color:#ffffff;font-family:Arial,sans-serif;font-size:24px;font-weight:bold;line-height:30px;margin-top:5px;">${escapeHtml(options.bannerTitle)}</div>
                                    <div style="color:#dbe5f3;font-family:Arial,sans-serif;font-size:12px;line-height:16px;margin-top:3px;">${escapeHtml(generatedDate)}</div>
                                </td>
                            </tr>
                            <tr>
                                <td style="font-family:Arial,sans-serif;color:#111827;font-size:18px;font-weight:bold;line-height:23px;padding:26px 0 8px 0;">
                                    ${escapeHtml(options.heading)}
                                </td>
                            </tr>
                            <tr>
                                <td style="font-family:Arial,sans-serif;color:#4b5563;font-size:15px;line-height:20px;padding:0 0 20px 0;">
                                    ${escapeHtml(options.body)}
                                </td>
                            </tr>
                            <tr>
                                <td>
                                    <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 20px 0;">
                                        <tr>
                                            <td>
                                                <a href="${escapeHtml(options.actionUrl)}" target="_blank" rel="noopener noreferrer" style="background:#1f5be3;color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;line-height:16px;padding:12px 24px;text-align:center;text-decoration:none;">
                                                    ${escapeHtml(options.actionLabel)}
                                                </a>
                                            </td>
                                        </tr>
                                    </table>
                                </td>
                            </tr>
                            <tr>
                                <td style="font-family:Arial,sans-serif;color:#6b7280;font-size:13px;line-height:18px;padding:0 0 4px 0;">Or use this token: <strong style="color:#111827;">${escapeHtml(options.token)}</strong></td>
                            </tr>
                            <tr>
                                <td style="border-top:1px solid #d7dde8;font-family:Arial,sans-serif;color:#4b5563;font-size:13px;line-height:18px;padding:20px 0 20px 0;">
                                    ${escapeHtml(options.footer)}
                                </td>
                            </tr>
                            <tr>
                                <td align="center" style="background:#f5f7fb;font-family:Arial,sans-serif;color:#6b7280;font-size:10px;line-height:15px;padding:16px 20px;">
                                    This email was generated automatically - please don't reply directly.<br />
                                    Questions? Reach our team at hello@silversurfers.ai.
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `.trim();

    const text = [
        options.bannerTitle,
        "",
        options.heading,
        options.body,
        "",
        `${options.actionLabel}: ${options.actionUrl}`,
        `Token: ${options.token}`,
        "",
        options.footer,
        "",
        "This email was generated automatically - please don't reply directly.",
        "Questions? Reach our team at hello@silversurfers.ai.",
    ].join("\n");

    return { html, text };
}

export function buildVerificationEmailContent(token: string, frontendUrl?: string): AuthEmailContent {
    return wrapAuthEmail({
        bannerTitle: "Welcome to SilverSurfers",
        heading: "Verify your email",
        body: "Thanks for signing up. Please verify your email address by clicking the button below.",
        actionLabel: "Verify Email",
        actionUrl: buildVerificationLink(token, frontendUrl),
        footer: "If you did not create an account, you can ignore this email.",
        token,
    });
}

export function buildPasswordResetEmailContent(token: string, frontendUrl?: string): AuthEmailContent {
    return wrapAuthEmail({
        bannerTitle: "Password Reset",
        heading: "Reset your password",
        body: "We received a request to reset your password. Click the button below to continue.",
        actionLabel: "Reset Password",
        actionUrl: buildPasswordResetLink(token, frontendUrl),
        footer: "If you did not request this, you can safely ignore this email.",
        token,
    });
}

export async function sendVerificationEmail(to: string, token: string): Promise<AuthEmailResult> {
    const content = buildVerificationEmailContent(token);
    return sendDirectMail({
        to,
        subject: "Verify your email",
        html: content.html,
        text: content.text,
    });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<AuthEmailResult> {
    const content = buildPasswordResetEmailContent(token);
    return sendDirectMail({
        to,
        subject: "Password Reset",
        html: content.html,
        text: content.text,
    });
}
