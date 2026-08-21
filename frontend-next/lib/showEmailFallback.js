// Ported from the showEmailFallback DOM-manipulation helper inline in
// frontend/src/pages/Home.js. Plain function (not a component), but touches
// `document`/`window` directly — only ever call this from Client Components
// (components/home/QuickScanSection.js and components/home/FinalCtaButtons.js).
export default function showEmailFallback(email) {
  const fallback = document.createElement('div');
  fallback.style.cssText = 'position:fixed;top:16px;right:16px;background:var(--surface);border:1px solid var(--sandd);border-radius:var(--rl);padding:16px;box-shadow:0 8px 32px rgba(8,80,65,0.12);z-index:9999;max-width:320px;font-family:var(--ff)';
  fallback.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:12px">
      <div style="flex:1">
        <p style="font-size: 16px;font-weight:600;color:var(--ink);margin-bottom:4px">Email us directly:</p>
        <p style="font-size: 16px;color:var(--t6);font-family:monospace;margin-bottom:6px">${email}</p>
        <p style="font-size: 16px;color:var(--ink3);margin-bottom:6px">Click to copy or email us manually</p>
        <button onclick="navigator.clipboard.writeText('${email}')" style="font-size: 16px;color:var(--t6);background:none;border:none;cursor:pointer;font-family:var(--ff);padding:0">Copy address</button>
      </div>
      <button onclick="this.parentElement.parentElement.remove()" style="color:var(--ink3);background:none;border:none;cursor:pointer;font-size:18px;line-height:1;padding:0;flex-shrink:0">&times;</button>
    </div>`;
  document.body.appendChild(fallback);
  setTimeout(() => { if (fallback.parentElement) fallback.remove(); }, 10000);
}
