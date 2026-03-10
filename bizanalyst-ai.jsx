import { useState, useRef, useEffect } from "react";
import * as Papa from "papaparse";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from "recharts";

const COLORS = ["#00E5A0", "#FF6B6B", "#4ECDC4", "#FFE66D", "#A78BFA", "#F472B6", "#38BDF8", "#FB923C"];

/* ─── Stripe Config ─── */
/* REPLACE these with your real Stripe price IDs from dashboard.stripe.com */
const STRIPE_CONFIG = {
  publishableKey: "pk_test_YOUR_KEY_HERE", // Get from Stripe Dashboard → API Keys
  prices: {
    pro_monthly: "price_XXXXXXX",       // Create in Stripe: $29/mo recurring
    pro_annual: "price_XXXXXXX",         // Create in Stripe: $23/mo billed annually ($276/yr)
    business_monthly: "price_XXXXXXX",   // Create in Stripe: $79/mo recurring
    business_annual: "price_XXXXXXX",    // Create in Stripe: $63/mo billed annually ($756/yr)
  },
  // For production, use your real domain
  successUrl: window.location.origin + "?checkout=success",
  cancelUrl: window.location.origin + "?checkout=cancel",
};

const PLANS = {
  free: { name: "Free", price: 0, analysesPerMonth: 3, aiAnalysis: false, pdfExport: false, excelUpload: false },
  pro: { name: "Pro", price: 29, analysesPerMonth: Infinity, aiAnalysis: true, pdfExport: true, excelUpload: true },
  business: { name: "Business", price: 79, analysesPerMonth: Infinity, aiAnalysis: true, pdfExport: true, excelUpload: true },
};

/* ─── Logo Component ─── */
function Logo({ size = 36 }) {
  return (
    <svg viewBox="0 0 512 512" width={size} height={size} style={{ borderRadius: size * 0.22, flexShrink: 0 }}>
      <defs>
        <linearGradient id="lgBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00E5A0"/><stop offset="100%" stopColor="#00B4D8"/>
        </linearGradient>
        <linearGradient id="lgBar1" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.7"/><stop offset="100%" stopColor="#fff" stopOpacity="1"/>
        </linearGradient>
        <linearGradient id="lgBar2" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.5"/><stop offset="100%" stopColor="#fff" stopOpacity="0.85"/>
        </linearGradient>
      </defs>
      <rect x="32" y="32" width="448" height="448" rx="96" ry="96" fill="url(#lgBg)"/>
      <rect x="118" y="298" width="52" height="104" rx="10" fill="url(#lgBar2)"/>
      <rect x="194" y="228" width="52" height="174" rx="10" fill="url(#lgBar1)"/>
      <rect x="270" y="168" width="52" height="234" rx="10" fill="url(#lgBar1)"/>
      <g transform="translate(368,158)">
        <path d="M0,-48 C4,-16 16,-4 48,0 C16,4 4,16 0,48 C-4,16 -16,4 -48,0 C-16,-4 -4,-16 0,-48Z" fill="white"/>
        <path d="M32,-52 C33,-44 36,-41 44,-40 C36,-39 33,-36 32,-28 C31,-36 28,-39 20,-40 C28,-41 31,-44 32,-52Z" fill="white" opacity="0.7"/>
      </g>
      <path d="M144,290 Q170,260 220,220 Q260,190 296,160" fill="none" stroke="white" strokeWidth="5" strokeLinecap="round" strokeOpacity="0.4" strokeDasharray="8,8"/>
    </svg>
  );
}

function formatNumber(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function detectNumericColumns(data) {
  if (!data.length) return [];
  return Object.keys(data[0]).filter(c => {
    const vals = data.map(r => r[c]).filter(v => v !== "" && v !== null && v !== undefined);
    return vals.filter(v => !isNaN(parseFloat(String(v).replace(/[$,]/g, "")))).length > vals.length * 0.6;
  });
}

function detectDateColumns(data) {
  if (!data.length) return [];
  return Object.keys(data[0]).filter(c => {
    const vals = data.map(r => r[c]).filter(v => v !== "" && v !== null);
    return vals.filter(v => !isNaN(Date.parse(v))).length > vals.length * 0.6;
  });
}

function detectCategoryColumns(data) {
  if (!data.length) return [];
  const numCols = detectNumericColumns(data);
  const dateCols = detectDateColumns(data);
  return Object.keys(data[0]).filter(c => !numCols.includes(c) && !dateCols.includes(c));
}

function cleanNumber(v) {
  if (v === null || v === undefined || v === "") return null;
  const cleaned = parseFloat(String(v).replace(/[$,]/g, ""));
  return isNaN(cleaned) ? null : cleaned;
}

function computeStats(data) {
  const numCols = detectNumericColumns(data);
  const stats = {};
  numCols.forEach(col => {
    const vals = data.map(r => cleanNumber(r[col])).filter(v => v !== null);
    if (!vals.length) return;
    const sum = vals.reduce((a, b) => a + b, 0);
    const mean = sum / vals.length;
    const sorted = [...vals].sort((a, b) => a - b);
    const min = sorted[0], max = sorted[sorted.length - 1];
    const std = Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
    const trend = vals.length > 2 ? ((vals[vals.length - 1] - vals[0]) / Math.abs(vals[0] || 1)) * 100 : 0;
    stats[col] = { sum, mean, median: sorted[Math.floor(sorted.length / 2)], min, max, std, count: vals.length, trend };
  });
  return stats;
}

function generateChartData(data) {
  const numCols = detectNumericColumns(data);
  const dateCols = detectDateColumns(data);
  const catCols = detectCategoryColumns(data);
  const charts = [];
  if (dateCols.length > 0 && numCols.length > 0) {
    const dateCol = dateCols[0];
    const sorted = [...data].sort((a, b) => new Date(a[dateCol]) - new Date(b[dateCol]));
    const trendCols = numCols.slice(0, 3);
    charts.push({
      type: "area", title: `${trendCols.join(" & ")} Over Time`,
      data: sorted.map(r => { const obj = { label: r[dateCol] }; trendCols.forEach(c => { obj[c] = cleanNumber(r[c]); }); return obj; }).filter(r => trendCols.some(c => r[c] !== null)),
      keys: trendCols
    });
  }
  if (catCols.length > 0 && numCols.length > 0) {
    const catCol = catCols[0], numCol = numCols[0], grouped = {};
    data.forEach(r => { const cat = r[catCol] || "Unknown"; if (!grouped[cat]) grouped[cat] = []; const v = cleanNumber(r[numCol]); if (v !== null) grouped[cat].push(v); });
    const barData = Object.entries(grouped).map(([k, vals]) => ({ label: k, value: vals.reduce((a, b) => a + b, 0) })).sort((a, b) => b.value - a.value).slice(0, 10);
    if (barData.length > 1) charts.push({ type: "bar", title: `${numCol} by ${catCol}`, data: barData });
    if (barData.length >= 2 && barData.length <= 8) charts.push({ type: "pie", title: `${numCol} Distribution by ${catCol}`, data: barData });
  }
  return charts;
}

function generateInsights(data, stats) {
  const insights = [];
  const numCols = Object.keys(stats);
  numCols.forEach(col => {
    const s = stats[col];
    if (s.trend > 20) insights.push({ type: "positive", icon: "📈", text: `${col} shows strong growth of +${s.trend.toFixed(1)}% from first to last entry.` });
    else if (s.trend < -20) insights.push({ type: "negative", icon: "📉", text: `${col} declined ${s.trend.toFixed(1)}% — investigate what changed.` });
    if (s.std / Math.abs(s.mean || 1) > 0.8) insights.push({ type: "warning", icon: "⚡", text: `${col} has high volatility (CV: ${((s.std / Math.abs(s.mean || 1)) * 100).toFixed(0)}%). Consider what's driving the swings.` });
    if (s.max > s.mean * 3 && s.count > 5) insights.push({ type: "warning", icon: "🔍", text: `${col} has outliers — max (${formatNumber(s.max)}) is ${(s.max / s.mean).toFixed(1)}x the average.` });
  });
  if (numCols.length >= 2) { const sorted = numCols.sort((a, b) => Math.abs(stats[b].trend) - Math.abs(stats[a].trend)); insights.push({ type: "info", icon: "🎯", text: `Most volatile metric: ${sorted[0]} — focus here first.` }); }
  insights.push({ type: "info", icon: "📊", text: `Dataset: ${data.length} records, ${Object.keys(data[0]).length} columns, ${numCols.length} numeric fields.` });
  return insights;
}

/* ─── Shared Styles ─── */
const inputStyle = {
  width: "100%",
  padding: "14px 18px",
  borderRadius: 12,
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.04)",
  color: "#fff",
  fontSize: 14,
  fontFamily: "'DM Sans', sans-serif",
  outline: "none",
  transition: "border-color 0.2s",
};

const primaryBtn = {
  width: "100%",
  padding: "14px 0",
  borderRadius: 12,
  border: "none",
  background: "linear-gradient(135deg, #00E5A0, #00B4D8)",
  color: "#000",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "'DM Sans', sans-serif",
  transition: "opacity 0.2s",
};

/* ─── Auth Screen ─── */
function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = () => {
    setError("");
    if (!email.includes("@")) { setError("Please enter a valid email"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (mode === "signup" && !name.trim()) { setError("Please enter your name"); return; }
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onAuth({
        email,
        name: mode === "signup" ? name : email.split("@")[0],
        company: company || null,
        plan: "free",
        analysesUsed: 0,
        joinedAt: new Date().toISOString(),
      });
    }, 800);
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0A0A0F",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>

      <div style={{ width: "100%", maxWidth: 420, padding: "0 24px", animation: "fadeUp 0.5s ease" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "inline-block", marginBottom: 16 }}><Logo size={56} /></div>
          <div style={{ fontSize: 24, fontWeight: 700, color: "#fff", letterSpacing: -0.5 }}>BizAnalyst AI</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 4, letterSpacing: 0.5 }}>INTELLIGENT BUSINESS ANALYTICS</div>
        </div>

        {/* Card */}
        <div style={{
          background: "rgba(255,255,255,0.02)",
          border: "1px solid rgba(255,255,255,0.06)",
          borderRadius: 20,
          padding: "36px 32px",
        }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginBottom: 6 }}>
            {mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p style={{ fontSize: 13, color: "#555", marginBottom: 28 }}>
            {mode === "login" ? "Sign in to access your analyses" : "Start analyzing your business data in seconds"}
          </p>

          {/* Google OAuth placeholder */}
          <button onClick={() => handleSubmit()} style={{
            ...primaryBtn,
            background: "rgba(255,255,255,0.06)",
            color: "#ccc",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            marginBottom: 24,
            border: "1px solid rgba(255,255,255,0.08)",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
            <span style={{ fontSize: 11, color: "#444", textTransform: "uppercase", letterSpacing: 1 }}>or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
          </div>

          {/* Form fields */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mode === "signup" && (
              <>
                <input
                  type="text" placeholder="Full name" value={name}
                  onChange={e => setName(e.target.value)}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = "rgba(0,229,160,0.4)"}
                  onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                />
                <input
                  type="text" placeholder="Company (optional)" value={company}
                  onChange={e => setCompany(e.target.value)}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = "rgba(0,229,160,0.4)"}
                  onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
                />
              </>
            )}
            <input
              type="email" placeholder="Email address" value={email}
              onChange={e => setEmail(e.target.value)}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = "rgba(0,229,160,0.4)"}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
            />
            <input
              type="password" placeholder="Password" value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSubmit()}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = "rgba(0,229,160,0.4)"}
              onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.1)"}
            />
          </div>

          {error && (
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.2)", color: "#FF6B6B", fontSize: 12 }}>
              {error}
            </div>
          )}

          {mode === "login" && (
            <div style={{ textAlign: "right", marginTop: 8 }}>
              <span style={{ fontSize: 12, color: "#00E5A0", cursor: "pointer" }}>Forgot password?</span>
            </div>
          )}

          <button onClick={handleSubmit} disabled={loading} style={{ ...primaryBtn, marginTop: 20, opacity: loading ? 0.6 : 1 }}>
            {loading ? "..." : mode === "login" ? "Sign In" : "Create Account"}
          </button>

          {mode === "signup" && (
            <p style={{ fontSize: 11, color: "#444", marginTop: 12, lineHeight: 1.5, textAlign: "center" }}>
              By creating an account, you agree to our Terms of Service and Privacy Policy.
            </p>
          )}
        </div>

        {/* Toggle */}
        <div style={{ textAlign: "center", marginTop: 24 }}>
          <span style={{ fontSize: 13, color: "#555" }}>
            {mode === "login" ? "Don't have an account? " : "Already have an account? "}
          </span>
          <span onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }} style={{ fontSize: 13, color: "#00E5A0", fontWeight: 600, cursor: "pointer" }}>
            {mode === "login" ? "Sign up free" : "Sign in"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Account Menu ─── */
function AccountMenu({ user, onLogout, onUpgrade, onViewAccount, isOpen, setIsOpen }) {
  if (!user) return null;
  const planInfo = PLANS[user.plan];
  const initial = (user.name || user.email)[0].toUpperCase();

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setIsOpen(!isOpen)} style={{
        width: 34, height: 34, borderRadius: 10,
        background: user.plan === "pro" ? "linear-gradient(135deg, #00E5A0, #00B4D8)" : user.plan === "business" ? "linear-gradient(135deg, #A78BFA, #F472B6)" : "rgba(255,255,255,0.1)",
        border: "none", color: user.plan === "free" ? "#aaa" : "#000",
        fontSize: 14, fontWeight: 700, cursor: "pointer",
        fontFamily: "'DM Sans', sans-serif",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>{initial}</button>

      {isOpen && (
        <>
          <div onClick={() => setIsOpen(false)} style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 98 }} />
          <div style={{
            position: "absolute", top: 44, right: 0, width: 280, zIndex: 99,
            background: "#141418", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, padding: 0, overflow: "hidden",
            boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
          }}>
            {/* User info */}
            <div style={{ padding: "20px 20px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>{user.name}</div>
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{user.email}</div>
              <div style={{
                display: "inline-block", marginTop: 10,
                padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 700,
                letterSpacing: 0.5, textTransform: "uppercase",
                background: user.plan === "pro" ? "rgba(0,229,160,0.12)" : user.plan === "business" ? "rgba(167,139,250,0.12)" : "rgba(255,255,255,0.06)",
                color: user.plan === "pro" ? "#00E5A0" : user.plan === "business" ? "#A78BFA" : "#888",
              }}>{planInfo.name} Plan</div>
            </div>

            {/* Usage */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Usage This Month</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#ccc" }}>Analyses</span>
                <span style={{ fontSize: 13, color: user.plan === "free" && user.analysesUsed >= 3 ? "#FF6B6B" : "#00E5A0", fontFamily: "'Space Mono', monospace" }}>
                  {user.analysesUsed} / {planInfo.analysesPerMonth === Infinity ? "∞" : planInfo.analysesPerMonth}
                </span>
              </div>
              {user.plan === "free" && (
                <div style={{
                  width: "100%", height: 3, background: "rgba(255,255,255,0.06)",
                  borderRadius: 2, marginTop: 8, overflow: "hidden",
                }}>
                  <div style={{
                    width: `${Math.min((user.analysesUsed / 3) * 100, 100)}%`, height: "100%",
                    background: user.analysesUsed >= 3 ? "#FF6B6B" : "#00E5A0",
                    borderRadius: 2, transition: "width 0.3s",
                  }} />
                </div>
              )}
            </div>

            {/* Features */}
            <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Your Features</div>
              {[
                { label: "AI Analysis", active: planInfo.aiAnalysis },
                { label: "PDF Export", active: planInfo.pdfExport },
                { label: "Excel Upload", active: planInfo.excelUpload },
              ].map((f, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontSize: 12, color: f.active ? "#ccc" : "#444" }}>{f.label}</span>
                  <span style={{ fontSize: 11, color: f.active ? "#00E5A0" : "#444" }}>{f.active ? "✓" : "✕"}</span>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div style={{ padding: "10px 12px" }}>
              <button onClick={() => { onViewAccount(); setIsOpen(false); }} style={{
                width: "100%", padding: "10px 14px", borderRadius: 10, border: "none",
                background: "transparent", color: "#ccc", fontSize: 13, textAlign: "left",
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              }}>Account Settings</button>
              {user.plan === "free" && (
                <button onClick={() => { onUpgrade(); setIsOpen(false); }} style={{
                  width: "100%", padding: "10px 14px", borderRadius: 10, border: "none",
                  background: "rgba(0,229,160,0.08)", color: "#00E5A0", fontSize: 13,
                  fontWeight: 600, textAlign: "left", cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif", marginTop: 2,
                }}>⚡ Upgrade to Pro</button>
              )}
              <button onClick={() => { onLogout(); setIsOpen(false); }} style={{
                width: "100%", padding: "10px 14px", borderRadius: 10, border: "none",
                background: "transparent", color: "#666", fontSize: 13, textAlign: "left",
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginTop: 2,
              }}>Sign Out</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ─── Account Settings ─── */
function AccountSettings({ user, setUser, onBack }) {
  const [editName, setEditName] = useState(user.name);
  const [editCompany, setEditCompany] = useState(user.company || "");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setUser({ ...user, name: editName, company: editCompany || null });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ animation: "fadeUp 0.5s ease", maxWidth: 560 }}>
      <button onClick={onBack} style={{
        background: "none", border: "none", color: "#555", fontSize: 13,
        cursor: "pointer", fontFamily: "'DM Sans', sans-serif", marginBottom: 24,
        display: "flex", alignItems: "center", gap: 6,
      }}>← Back</button>

      <h2 style={{ fontSize: 24, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Account Settings</h2>
      <p style={{ fontSize: 13, color: "#555", marginBottom: 32 }}>Manage your profile and subscription</p>

      {/* Profile */}
      <div style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16, padding: 28, marginBottom: 20,
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#888", marginBottom: 20, textTransform: "uppercase", letterSpacing: 1 }}>Profile</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 6 }}>Full Name</label>
            <input type="text" value={editName} onChange={e => setEditName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 6 }}>Email</label>
            <input type="email" value={user.email} disabled style={{ ...inputStyle, opacity: 0.5, cursor: "not-allowed" }} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "#666", display: "block", marginBottom: 6 }}>Company</label>
            <input type="text" value={editCompany} onChange={e => setEditCompany(e.target.value)} placeholder="Optional" style={inputStyle} />
          </div>
        </div>
        <button onClick={handleSave} style={{ ...primaryBtn, width: "auto", padding: "10px 28px", marginTop: 20 }}>
          {saved ? "✓ Saved" : "Save Changes"}
        </button>
      </div>

      {/* Subscription */}
      <div style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16, padding: 28, marginBottom: 20,
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#888", marginBottom: 20, textTransform: "uppercase", letterSpacing: 1 }}>Subscription</h3>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>{PLANS[user.plan].name} Plan</div>
            <div style={{ fontSize: 13, color: "#555", marginTop: 4 }}>
              {user.plan === "free" ? "3 analyses per month" : "Unlimited analyses"}
            </div>
          </div>
          <div style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 18, fontWeight: 700,
            color: "#fff", fontFamily: "'Space Mono', monospace",
          }}>${PLANS[user.plan].price}<span style={{ fontSize: 12, color: "#555", fontWeight: 400 }}>/mo</span></div>
        </div>
        {user.plan === "free" && (
          <button onClick={() => onBack("pricing")} style={{
            ...primaryBtn, marginTop: 20, width: "auto", padding: "10px 28px",
          }}>Upgrade Plan</button>
        )}
        {user.plan !== "free" && (
          <button onClick={() => setUser({ ...user, plan: "free" })} style={{
            marginTop: 20, padding: "10px 28px", borderRadius: 12,
            border: "1px solid rgba(255,107,107,0.2)", background: "transparent",
            color: "#FF6B6B", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
          }}>Cancel Subscription</button>
        )}
      </div>

      {/* Danger zone */}
      <div style={{
        background: "rgba(255,107,107,0.03)", border: "1px solid rgba(255,107,107,0.1)",
        borderRadius: 16, padding: 28,
      }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#FF6B6B", marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>Danger Zone</h3>
        <p style={{ fontSize: 13, color: "#555", marginBottom: 16 }}>Permanently delete your account and all data.</p>
        <button style={{
          padding: "10px 28px", borderRadius: 12,
          border: "1px solid rgba(255,107,107,0.3)", background: "transparent",
          color: "#FF6B6B", fontSize: 13, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
        }}>Delete Account</button>
      </div>
    </div>
  );
}

/* ─── Reusable Components ─── */
function MetricCard({ label, value, sub, trend }) {
  return (
    <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "20px 24px", flex: "1 1 200px", minWidth: 180 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, color: "#888", marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: "#fff", fontFamily: "'Space Mono', monospace", lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#666", marginTop: 6 }}>{sub}</div>}
      {trend !== undefined && trend !== 0 && <div style={{ fontSize: 12, marginTop: 6, color: trend > 0 ? "#00E5A0" : "#FF6B6B" }}>{trend > 0 ? "↑" : "↓"} {Math.abs(trend).toFixed(1)}% change</div>}
    </div>
  );
}

function ChartCard({ chart }) {
  const tt = { backgroundColor: "rgba(15,15,20,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12, color: "#fff", fontFamily: "'DM Sans', sans-serif" };
  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 24, flex: chart.type === "pie" ? "0 1 380px" : "1 1 500px", minWidth: 300 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: "#ccc", marginBottom: 20 }}>{chart.title}</div>
      <ResponsiveContainer width="100%" height={260}>
        {chart.type === "area" ? (
          <AreaChart data={chart.data}>
            <defs>{chart.keys.map((k, i) => (<linearGradient key={k} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={COLORS[i]} stopOpacity={0.3} /><stop offset="100%" stopColor={COLORS[i]} stopOpacity={0} /></linearGradient>))}</defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fill: "#555", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
            <YAxis tick={{ fill: "#555", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
            <Tooltip contentStyle={tt} />
            {chart.keys.map((k, i) => <Area key={k} type="monotone" dataKey={k} stroke={COLORS[i]} fill={`url(#grad-${i})`} strokeWidth={2} dot={false} />)}
          </AreaChart>
        ) : chart.type === "bar" ? (
          <BarChart data={chart.data}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="label" tick={{ fill: "#555", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} angle={-20} textAnchor="end" height={60} />
            <YAxis tick={{ fill: "#555", fontSize: 10 }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} />
            <Tooltip contentStyle={tt} />
            {chart.keys ? chart.keys.map((k, i) => <Bar key={k} dataKey={k} fill={COLORS[i]} radius={[4, 4, 0, 0]} />) : <Bar dataKey="value" fill={COLORS[0]} radius={[4, 4, 0, 0]} />}
          </BarChart>
        ) : (
          <PieChart>
            <Pie data={chart.data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={100} innerRadius={50} strokeWidth={0}>{chart.data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie>
            <Tooltip contentStyle={tt} />
          </PieChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function InsightCard({ insight }) {
  const bg = insight.type === "positive" ? "rgba(0,229,160,0.08)" : insight.type === "negative" ? "rgba(255,107,107,0.08)" : insight.type === "warning" ? "rgba(255,230,109,0.08)" : "rgba(255,255,255,0.03)";
  const border = insight.type === "positive" ? "rgba(0,229,160,0.2)" : insight.type === "negative" ? "rgba(255,107,107,0.2)" : insight.type === "warning" ? "rgba(255,230,109,0.2)" : "rgba(255,255,255,0.06)";
  return (
    <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "14px 18px", display: "flex", alignItems: "flex-start", gap: 12 }}>
      <span style={{ fontSize: 20 }}>{insight.icon}</span>
      <span style={{ fontSize: 13, color: "#ccc", lineHeight: 1.5 }}>{insight.text}</span>
    </div>
  );
}

/* ─── AI Analysis (gated) ─── */
function AIAnalysis({ data, stats, user, onUpgrade }) {
  const [analysis, setAnalysis] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const canUseAI = user && PLANS[user.plan].aiAnalysis;

  useEffect(() => {
    if (!canUseAI) { setLoading(false); return; }
    async function analyze() {
      try {
        const numCols = detectNumericColumns(data);
        const statsStr = Object.entries(stats).map(([col, s]) => `${col}: sum=${formatNumber(s.sum)}, avg=${formatNumber(s.mean)}, min=${formatNumber(s.min)}, max=${formatNumber(s.max)}, trend=${s.trend.toFixed(1)}%`).join("\n");
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-20250514", max_tokens: 1000,
            messages: [{ role: "user", content: `You are a business analyst AI. Analyze this data:\n\nDATASET: ${data.length} rows, columns: ${Object.keys(data[0]).join(", ")}\nNumeric: ${numCols.join(", ")}\n\nSTATISTICS:\n${statsStr}\n\nSAMPLE (first 10):\n${JSON.stringify(data.slice(0, 10), null, 2)}\n\nProvide:\n1. **Executive Summary** (2-3 sentences)\n2. **Key Findings** (3-4 bullets with numbers)\n3. **Red Flags** (anything concerning)\n4. **Recommendations** (3-4 actionable steps)\n\nBe direct. Use real numbers. No fluff.` }]
          })
        });
        const result = await response.json();
        setAnalysis(result.content?.map(b => b.text || "").join("") || "Analysis could not be generated.");
        setLoading(false);
      } catch { setError("AI analysis failed — charts and stats are still available above."); setLoading(false); }
    }
    analyze();
  }, []);

  if (!canUseAI) {
    return (
      <div style={{
        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
        borderRadius: 16, padding: "40px 32px", textAlign: "center",
      }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", marginBottom: 8 }}>AI Analysis is a Pro Feature</div>
        <div style={{ fontSize: 13, color: "#555", marginBottom: 24, maxWidth: 400, margin: "0 auto 24px" }}>
          Upgrade to Pro to get AI-powered executive summaries, key findings, red flags, and actionable recommendations for every dataset.
        </div>
        <button onClick={onUpgrade} style={{ ...primaryBtn, width: "auto", padding: "12px 32px", display: "inline-block" }}>
          Upgrade to Pro — $29/mo
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 16, padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 12 }}>🧠</div>
        <div style={{ color: "#00E5A0", fontSize: 14, marginBottom: 8 }}>AI is analyzing your data...</div>
        <div style={{ width: 200, height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 2, margin: "0 auto", overflow: "hidden" }}>
          <div style={{ width: "40%", height: "100%", background: "linear-gradient(90deg, #00E5A0, #4ECDC4)", borderRadius: 2, animation: "pulse 1.5s ease-in-out infinite" }} />
        </div>
      </div>
    );
  }
  if (error) return <div style={{ background: "rgba(255,107,107,0.05)", border: "1px solid rgba(255,107,107,0.15)", borderRadius: 16, padding: 24, color: "#ccc", fontSize: 13 }}>{error}</div>;

  return (
    <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(0,229,160,0.15)", borderRadius: 16, padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <span style={{ fontSize: 20 }}>🧠</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: "#00E5A0" }}>AI Analysis</span>
      </div>
      <div style={{ fontSize: 13.5, color: "#bbb", lineHeight: 1.8, whiteSpace: "pre-wrap" }}>
        {analysis.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
          part.startsWith("**") && part.endsWith("**") ? <strong key={i} style={{ color: "#fff", fontWeight: 600 }}>{part.slice(2, -2)}</strong> : part
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════ */
/* ─── MAIN APP ─── */
/* ═══════════════════════════════════════════ */
export default function BizAnalystAI() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [fileName, setFileName] = useState("");
  const [stats, setStats] = useState(null);
  const [charts, setCharts] = useState([]);
  const [insights, setInsights] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [view, setView] = useState("upload");
  const [billing, setBilling] = useState("monthly");
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const fileRef = useRef(null);

  // If no user, show auth
  if (!user) return <AuthScreen onAuth={(u) => { setUser(u); setView("upload"); }} />;

  const handleFile = (file) => {
    if (!file) return;
    const plan = PLANS[user.plan];
    if (user.plan === "free" && user.analysesUsed >= plan.analysesPerMonth) {
      setView("pricing");
      return;
    }
    setFileName(file.name);
    Papa.parse(file, { header: true, skipEmptyLines: true, complete: (r) => processData(r.data) });
  };

  const processData = (parsed) => {
    if (!parsed || !parsed.length) return;
    const cleaned = parsed.filter(r => Object.values(r).some(v => v !== "" && v !== null));
    setData(cleaned);
    const s = computeStats(cleaned);
    setStats(s);
    setCharts(generateChartData(cleaned));
    setInsights(generateInsights(cleaned, s));
    setUser({ ...user, analysesUsed: user.analysesUsed + 1 });
    setView("dashboard");
  };

  const loadSample = () => {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const cats = ["Online","Retail","Wholesale","Subscription"];
    const d = [];
    for (let m = 0; m < 12; m++) for (const cat of cats) {
      const base = cat === "Online" ? 12000 : cat === "Retail" ? 8000 : cat === "Wholesale" ? 15000 : 5000;
      const rev = base + m * base * 0.05 + (Math.random() - 0.3) * base * 0.3;
      const cost = rev * (0.4 + Math.random() * 0.15);
      d.push({ Date: `2025-${String(m+1).padStart(2,"0")}-01`, Month: months[m], Channel: cat, Revenue: rev.toFixed(2), Costs: cost.toFixed(2), Profit: (rev-cost).toFixed(2), Customers: Math.floor(rev/(50+Math.random()*30)), "Avg Order": (40+Math.random()*60).toFixed(2) });
    }
    setFileName("sample-business-data.csv");
    processData(d);
  };

  const [checkoutLoading, setCheckoutLoading] = useState(null);
  const [checkoutModal, setCheckoutModal] = useState(null); // { plan, billing }

  // Check for Stripe checkout return
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      // In production, verify payment via webhook. For now, upgrade locally.
      setUser(u => u ? { ...u, plan: "pro" } : u);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const handleUpgrade = (planKey) => {
    if (planKey === "free") {
      setUser({ ...user, plan: "free" });
      setView(data ? "dashboard" : "upload");
      return;
    }
    // Show checkout confirmation modal
    setCheckoutModal({ plan: planKey, billing });
  };

  const handleStripeCheckout = async () => {
    const planKey = checkoutModal.plan;
    const bill = checkoutModal.billing;
    const priceId = STRIPE_CONFIG.prices[`${planKey}_${bill}`];
    setCheckoutLoading(planKey);

    // In production: call your backend to create a Stripe Checkout Session
    // Your backend would use:
    //   const session = await stripe.checkout.sessions.create({
    //     mode: 'subscription',
    //     line_items: [{ price: priceId, quantity: 1 }],
    //     success_url: STRIPE_CONFIG.successUrl,
    //     cancel_url: STRIPE_CONFIG.cancelUrl,
    //     customer_email: user.email,
    //   });
    //   return session.url;
    //
    // Then redirect: window.location.href = session.url;

    // Demo mode: simulate checkout
    setTimeout(() => {
      setUser({ ...user, plan: planKey });
      setCheckoutLoading(null);
      setCheckoutModal(null);
      setView(data ? "dashboard" : "upload");
    }, 1500);
  };

  const topStats = stats ? Object.entries(stats).slice(0, 4) : [];

  return (
    <div style={{ minHeight: "100vh", background: "#0A0A0F", color: "#fff", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap');
        @keyframes pulse { 0%,100%{transform:translateX(-100%)} 50%{transform:translateX(250%)} }
        @keyframes fadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
      `}</style>

      {/* Header */}
      <div style={{ padding: "24px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, cursor: "pointer" }} onClick={() => setView(data ? "dashboard" : "upload")}>
          <Logo size={36} />
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>BizAnalyst AI</div>
            <div style={{ fontSize: 11, color: "#555", letterSpacing: 0.5 }}>INTELLIGENT BUSINESS ANALYTICS</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", gap: 4 }}>
            {(data ? ["dashboard", "data", "pricing"] : ["upload", "pricing"]).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)",
                background: view === v ? "rgba(0,229,160,0.15)" : "transparent",
                color: view === v ? "#00E5A0" : "#666", fontSize: 12, fontWeight: 600,
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif", textTransform: "capitalize",
              }}>{v}</button>
            ))}
          </div>
          {/* Free plan badge */}
          {user.plan === "free" && view !== "pricing" && (
            <button onClick={() => setView("pricing")} style={{
              padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(0,229,160,0.2)",
              background: "rgba(0,229,160,0.06)", color: "#00E5A0", fontSize: 11,
              fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
            }}>⚡ Upgrade</button>
          )}
          <AccountMenu
            user={user}
            onLogout={() => { setUser(null); setData(null); setView("upload"); }}
            onUpgrade={() => setView("pricing")}
            onViewAccount={() => setView("account")}
            isOpen={menuOpen}
            setIsOpen={setMenuOpen}
          />
        </div>
      </div>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "32px 40px" }}>

        {/* ─── Account Settings ─── */}
        {view === "account" ? (
          <AccountSettings user={user} setUser={setUser} onBack={(target) => setView(target || (data ? "dashboard" : "upload"))} />

        /* ─── Pricing ─── */
        ) : view === "pricing" ? (
          <div style={{ animation: "fadeUp 0.5s ease" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <h2 style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1.5, marginBottom: 12, background: "linear-gradient(135deg, #fff 30%, #00E5A0)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Simple pricing.<br />Powerful insights.</h2>
              <p style={{ fontSize: 15, color: "#555", maxWidth: 460, margin: "0 auto" }}>Start free. Upgrade when your business demands more.</p>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 40 }}>
              {["monthly", "annual"].map(p => (
                <button key={p} onClick={() => setBilling(p)} style={{
                  padding: "10px 24px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.08)",
                  background: billing === p ? "rgba(0,229,160,0.12)" : "transparent",
                  color: billing === p ? "#00E5A0" : "#666", fontSize: 13, fontWeight: 600,
                  cursor: "pointer", fontFamily: "'DM Sans', sans-serif", textTransform: "capitalize",
                }}>{p}{p === "annual" ? " (save 20%)" : ""}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap", justifyContent: "center", marginBottom: 60 }}>
              {[
                { key: "free", name: "Free", price: 0, annual: 0, desc: "Try it out", color: "#888", popular: false,
                  features: ["3 analyses per month","CSV upload only","Basic charts & metrics","Community support"],
                  limits: ["No AI analysis","No PDF export","Watermarked reports"] },
                { key: "pro", name: "Pro", price: 29, annual: 23, desc: "For growing businesses", color: "#00E5A0", popular: true,
                  features: ["Unlimited analyses","CSV & Excel upload","Advanced charts & trends","AI-powered insights","PDF report export","Email support","30-day data history"], limits: [] },
                { key: "business", name: "Business", price: 79, annual: 63, desc: "For teams & agencies", color: "#A78BFA", popular: false,
                  features: ["Everything in Pro","5 team members","Shopify / Stripe / QuickBooks sync","White-label PDF reports","Custom branding","API access","Priority support","Unlimited data history"], limits: [] },
              ].map(plan => (
                <div key={plan.key} style={{
                  background: plan.popular ? "rgba(0,229,160,0.04)" : "rgba(255,255,255,0.02)",
                  border: `${plan.popular ? "2px" : "1px"} solid ${plan.popular ? "rgba(0,229,160,0.3)" : "rgba(255,255,255,0.06)"}`,
                  borderRadius: 20, padding: "36px 32px", flex: "1 1 280px", maxWidth: 340, minWidth: 280,
                  position: "relative", display: "flex", flexDirection: "column",
                }}>
                  {plan.popular && <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg, #00E5A0, #00B4D8)", color: "#000", fontSize: 11, fontWeight: 700, padding: "5px 16px", borderRadius: 20, letterSpacing: 0.5 }}>MOST POPULAR</div>}
                  {user.plan === plan.key && <div style={{ position: "absolute", top: 14, right: 16, fontSize: 10, fontWeight: 700, color: "#00E5A0", letterSpacing: 0.5, textTransform: "uppercase" }}>Current Plan</div>}
                  <div style={{ fontSize: 13, fontWeight: 600, color: plan.color, marginBottom: 4 }}>{plan.name}</div>
                  <div style={{ fontSize: 11, color: "#555", marginBottom: 20 }}>{plan.desc}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 24 }}>
                    <span style={{ fontSize: 44, fontWeight: 700, color: "#fff", fontFamily: "'Space Mono', monospace", lineHeight: 1 }}>${billing === "annual" ? plan.annual : plan.price}</span>
                    {plan.price > 0 && <span style={{ fontSize: 13, color: "#555" }}>/mo</span>}
                  </div>
                  {billing === "annual" && plan.price > 0 && (
                    <div style={{ fontSize: 11, color: "#00E5A0", marginTop: -16, marginBottom: 16 }}>Billed ${(billing === "annual" ? plan.annual : plan.price) * 12}/year — save ${(plan.price - plan.annual) * 12}/yr</div>
                  )}
                  <button onClick={() => {
                    if (plan.key === user.plan) return;
                    handleUpgrade(plan.key);
                  }} style={{
                    ...primaryBtn,
                    background: plan.key === user.plan ? "rgba(255,255,255,0.06)" : plan.popular ? "linear-gradient(135deg, #00E5A0, #00B4D8)" : "transparent",
                    color: plan.key === user.plan ? "#555" : plan.popular ? "#000" : "#ccc",
                    border: plan.popular || plan.key === user.plan ? "none" : "1px solid rgba(255,255,255,0.1)",
                    cursor: plan.key === user.plan ? "default" : "pointer",
                    marginBottom: 28,
                  }}>{plan.key === user.plan ? "Current Plan" : plan.price === 0 ? "Downgrade" : `Start ${plan.name} Trial`}</button>
                  <div style={{ flex: 1 }}>
                    {plan.features.map((f, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><span style={{ color: plan.color, fontSize: 14 }}>✓</span><span style={{ fontSize: 13, color: "#aaa" }}>{f}</span></div>)}
                    {plan.limits.map((f, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}><span style={{ color: "#444", fontSize: 14 }}>✕</span><span style={{ fontSize: 13, color: "#555" }}>{f}</span></div>)}
                  </div>
                </div>
              ))}
            </div>
            {/* FAQ */}
            <div style={{ maxWidth: 640, margin: "0 auto" }}>
              <h3 style={{ fontSize: 20, fontWeight: 700, textAlign: "center", marginBottom: 28, color: "#fff" }}>Frequently Asked Questions</h3>
              {[
                { q: "What file formats do you support?", a: "Free supports CSV. Pro and Business support CSV, Excel (.xlsx), and direct integrations." },
                { q: "Is my data secure?", a: "Encrypted in transit and at rest. We never share or sell your data." },
                { q: "Can I cancel anytime?", a: "Yes — no contracts, no fees. Cancel in one click." },
                { q: "Do you offer a free trial?", a: "Yes — 14-day free trial on Pro and Business. No credit card required." },
              ].map((faq, i) => (
                <div key={i} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: "18px 22px", marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#ddd", marginBottom: 8 }}>{faq.q}</div>
                  <div style={{ fontSize: 13, color: "#777", lineHeight: 1.6 }}>{faq.a}</div>
                </div>
              ))}
            </div>
          </div>

        /* ─── Upload ─── */
        ) : !data || view === "upload" ? (
          <div style={{ animation: "fadeUp 0.6s ease" }}>
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <h1 style={{ fontSize: 48, fontWeight: 700, letterSpacing: -2, marginBottom: 16, background: "linear-gradient(135deg, #fff 30%, #00E5A0)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Drop your data.<br />Get answers.</h1>
              <p style={{ fontSize: 16, color: "#555", maxWidth: 500, margin: "0 auto" }}>Upload any business spreadsheet and get instant AI-powered insights, trends, and recommendations.</p>
            </div>
            {/* Usage indicator for free plan */}
            {user.plan === "free" && (
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <span style={{ fontSize: 12, color: user.analysesUsed >= 3 ? "#FF6B6B" : "#888", padding: "6px 14px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  {user.analysesUsed}/3 free analyses used this month
                  {user.analysesUsed >= 3 && " — upgrade for unlimited"}
                </span>
              </div>
            )}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => { if (user.plan === "free" && user.analysesUsed >= 3) { setView("pricing"); } else { fileRef.current?.click(); } }}
              style={{
                border: `2px dashed ${user.plan === "free" && user.analysesUsed >= 3 ? "rgba(255,107,107,0.3)" : dragOver ? "#00E5A0" : "rgba(255,255,255,0.1)"}`,
                borderRadius: 20, padding: "80px 40px", textAlign: "center", cursor: "pointer",
                background: dragOver ? "rgba(0,229,160,0.03)" : "rgba(255,255,255,0.01)",
                transition: "all 0.3s ease", maxWidth: 600, margin: "0 auto",
              }}
            >
              <input ref={fileRef} type="file" accept=".csv,.tsv" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
              {user.plan === "free" && user.analysesUsed >= 3 ? (
                <>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: "#FF6B6B", marginBottom: 8 }}>Free limit reached</div>
                  <div style={{ fontSize: 13, color: "#555" }}>Upgrade to Pro for unlimited analyses</div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>⬆️</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: "#fff", marginBottom: 8 }}>Drop your CSV here</div>
                  <div style={{ fontSize: 13, color: "#555" }}>or click to browse</div>
                </>
              )}
            </div>
            <div style={{ textAlign: "center", marginTop: 32 }}>
              <span style={{ color: "#444", fontSize: 13 }}>No data handy? </span>
              <button onClick={loadSample} style={{ background: "none", border: "none", color: "#00E5A0", fontSize: 13, fontWeight: 600, cursor: "pointer", textDecoration: "underline", fontFamily: "'DM Sans', sans-serif" }}>Try with sample data →</button>
            </div>
          </div>

        /* ─── Dashboard ─── */
        ) : view === "dashboard" ? (
          <div style={{ animation: "fadeUp 0.5s ease" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>{fileName}</h2>
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>{data.length} rows · {Object.keys(data[0]).length} columns · analyzed just now</div>
              </div>
              <button onClick={() => { setData(null); setStats(null); setCharts([]); setInsights([]); setFileName(""); setView("upload"); }} style={{
                padding: "8px 20px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.08)",
                background: "transparent", color: "#888", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              }}>New Analysis</button>
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
              {topStats.map(([col, s]) => <MetricCard key={col} label={col} value={formatNumber(s.sum)} sub={`avg: ${formatNumber(s.mean)}`} trend={s.trend} />)}
            </div>
            {charts.length > 0 && <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>{charts.map((c, i) => <ChartCard key={i} chart={c} />)}</div>}
            <div style={{ marginBottom: 28 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: "#888", marginBottom: 14, textTransform: "uppercase", letterSpacing: 1 }}>Quick Insights</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{insights.map((ins, i) => <InsightCard key={i} insight={ins} />)}</div>
            </div>
            <AIAnalysis data={data} stats={stats} user={user} onUpgrade={() => setView("pricing")} />
          </div>

        /* ─── Data Table ─── */
        ) : (
          <div style={{ animation: "fadeUp 0.5s ease" }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Raw Data</h3>
            <div style={{ overflowX: "auto", borderRadius: 12, border: "1px solid rgba(255,255,255,0.06)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr>{Object.keys(data[0]).map(col => (
                  <th key={col} style={{ padding: "12px 16px", textAlign: "left", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#00E5A0", fontWeight: 600, position: "sticky", top: 0, background: "#0A0A0F", fontFamily: "'Space Mono', monospace", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{col}</th>
                ))}</tr></thead>
                <tbody>{data.slice(0, 100).map((row, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    {Object.values(row).map((val, j) => <td key={j} style={{ padding: "10px 16px", color: "#999", fontFamily: "'Space Mono', monospace", fontSize: 11 }}>{val}</td>)}
                  </tr>
                ))}</tbody>
              </table>
              {data.length > 100 && <div style={{ padding: 16, textAlign: "center", color: "#444", fontSize: 12 }}>Showing first 100 of {data.length} rows</div>}
            </div>
          </div>
        )}
      </div>

      {/* ─── Stripe Checkout Modal ─── */}
      {checkoutModal && (
        <>
          <div onClick={() => { setCheckoutModal(null); setCheckoutLoading(null); }} style={{
            position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", zIndex: 200,
          }} />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
            width: "100%", maxWidth: 440, zIndex: 201,
            background: "#141418", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 24, padding: "36px 32px",
            boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
            animation: "fadeUp 0.3s ease",
          }}>
            <div style={{ textAlign: "center" }}>
              <Logo size={48} />
              <h3 style={{ fontSize: 22, fontWeight: 700, color: "#fff", marginTop: 16, marginBottom: 6 }}>
                Upgrade to {PLANS[checkoutModal.plan]?.name}
              </h3>
              <p style={{ fontSize: 13, color: "#555", marginBottom: 28 }}>
                You'll be redirected to Stripe's secure checkout
              </p>
            </div>

            <div style={{
              background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14, padding: "20px 22px", marginBottom: 24,
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "#aaa" }}>{PLANS[checkoutModal.plan]?.name} Plan</span>
                <span style={{ fontSize: 13, color: "#fff", fontFamily: "'Space Mono', monospace" }}>
                  ${checkoutModal.billing === "annual"
                    ? (checkoutModal.plan === "pro" ? "23" : "63")
                    : PLANS[checkoutModal.plan]?.price}/mo
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <span style={{ fontSize: 13, color: "#aaa" }}>Billing</span>
                <span style={{ fontSize: 13, color: "#fff", textTransform: "capitalize" }}>{checkoutModal.billing}</span>
              </div>
              <div style={{ height: 1, background: "rgba(255,255,255,0.06)", margin: "12px 0" }} />
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: "#fff" }}>Total</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#00E5A0", fontFamily: "'Space Mono', monospace" }}>
                  ${checkoutModal.billing === "annual"
                    ? (checkoutModal.plan === "pro" ? "276" : "756") + "/yr"
                    : PLANS[checkoutModal.plan]?.price + "/mo"}
                </span>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, justifyContent: "center" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00E5A0" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
              <span style={{ fontSize: 11, color: "#555" }}>Secured by Stripe — your card details never touch our servers</span>
            </div>

            <button onClick={handleStripeCheckout} disabled={!!checkoutLoading} style={{
              ...primaryBtn,
              opacity: checkoutLoading ? 0.6 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            }}>
              {checkoutLoading ? "Processing..." : "Proceed to Checkout"}
            </button>

            <button onClick={() => { setCheckoutModal(null); setCheckoutLoading(null); }} style={{
              width: "100%", padding: "12px 0", borderRadius: 12, border: "none",
              background: "transparent", color: "#555", fontSize: 13, cursor: "pointer",
              fontFamily: "'DM Sans', sans-serif", marginTop: 8,
            }}>Cancel</button>

            <div style={{ textAlign: "center", marginTop: 12 }}>
              <span style={{ fontSize: 11, color: "#444" }}>14-day free trial · Cancel anytime · No questions asked</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
