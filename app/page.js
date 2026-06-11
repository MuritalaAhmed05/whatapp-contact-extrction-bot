"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export default function Home() {
  const [activeStep, setActiveStep] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Auto transition mockup steps every 6 seconds to make the UI feel alive
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveStep((prev) => (prev + 1) % 3);
    }, 6000);
    return () => clearInterval(timer);
  }, []);

  const steps = [
    {
      num: "Step 01",
      title: "Scan & Connect",
      desc: "Scan the QR code from WhatsApp on your phone or link via pairing code. Connect instantly in seconds without sharing passwords.",
      mockup: (
        <div className="mock-qr-wrapper">
          <div className="mock-qr-box">
            <div className="mock-qr-lines"></div>
            <div className="mock-qr-scanner-line"></div>
          </div>
          <p style={{ fontSize: "11px", color: "var(--accent)", fontWeight: "600" }}>
            🔑 Authenticating secure session...
          </p>
        </div>
      )
    },
    {
      num: "Step 02",
      title: "Choose WhatsApp Groups",
      desc: "Search, filter and select one or multiple groups. Our dashboard loads your groups list in real-time.",
      mockup: (
        <div className="mock-group-list-wrapper">
          <div className="mock-group-card selected">
            <span className="mock-group-name">📈 Real Estate Network</span>
            <span className="mock-group-dot"></span>
          </div>
          <div className="mock-group-card">
            <span className="mock-group-name">💬 Design Feedback</span>
            <span className="mock-group-dot"></span>
          </div>
          <div className="mock-group-card selected">
            <span className="mock-group-name">🚀 Tech Founders Hub</span>
            <span className="mock-group-dot"></span>
          </div>
        </div>
      )
    },
    {
      num: "Step 03",
      title: "Filter & Export",
      desc: "Filter by country codes, exclude admins, customize rates, and split large groups into batches. Export as Excel/CSV instantly.",
      mockup: (
        <div className="mock-export-wrapper">
          <div className="mock-progress-bar">
            <div className="mock-progress-bar-fill"></div>
          </div>
          <div className="mock-excel-card">
            <span className="mock-excel-icon">📥</span>
            <div style={{ textAlign: "left" }}>
              <strong style={{ display: "block", fontSize: "12px", color: "var(--success)" }}>contacts_export.xlsx</strong>
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>1,438 contacts saved successfully</span>
            </div>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="landing-page-container">
      {/* Background Blobs */}
      <div className="blob-bg">
        <div className="blob blob-1" style={{ top: "-10%", left: "10%" }}></div>
        <div className="blob blob-2" style={{ top: "30%", right: "10%" }}></div>
        <div className="blob blob-3" style={{ bottom: "10%", left: "20%" }}></div>
      </div>

      {/* Navigation */}
      <nav className="landing-nav">
        <div className="logo-area">
          <img
            src="/logo.png"
            alt="Logo"
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "8px",
              boxShadow: "0 0 10px rgba(37,211,102,0.3)"
            }}
          />
          <div className="logo-text">
            <h1 style={{ fontSize: "16px", fontWeight: "800" }}>WhatsApp Extractor</h1>
            <p style={{ fontSize: "11px", color: "var(--text-muted)" }}>Enterprise WhatsApp scraping</p>
          </div>
        </div>
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? "✕" : "☰"}
        </button>
        <div className={`landing-nav-links ${mobileMenuOpen ? "open" : ""}`}>
          <a href="#features" className="landing-nav-link" onClick={() => setMobileMenuOpen(false)}>Features</a>
          <a href="#demo" className="landing-nav-link" onClick={() => setMobileMenuOpen(false)}>How It Works</a>
          <a href="#pricing" className="landing-nav-link" onClick={() => setMobileMenuOpen(false)}>Pricing</a>
          <Link href="/dashboard" className="btn btn-primary btn-glow" style={{ padding: "8px 18px", fontSize: "13px" }} onClick={() => setMobileMenuOpen(false)}>
            Launch App
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <header className="landing-hero">
        <div className="landing-hero-tag">
          <span className="landing-hero-tag-dot"></span>
          <span>WhatsApp Extractor SaaS v2.0 is Live</span>
        </div>
        <h1>
          Scrape and Export WhatsApp Group Contacts <span>Instantly</span>
        </h1>
        <p>
          The ultimate utility tool for marketers, recruiters, and sales agents. Extract names, numbers, pushnames, and country prefixes safely into Excel sheets in seconds.
        </p>
        <div className="landing-ctas">
          <Link href="/dashboard" className="btn btn-primary btn-glow" style={{ padding: "14px 28px", borderRadius: "14px", fontSize: "16px" }}>
            Launch App (Free Trial)
          </Link>
          <a href="#demo" className="btn btn-secondary btn-secondary-glass" style={{ padding: "14px 28px", borderRadius: "14px", fontSize: "16px" }}>
            Watch Demo
          </a>
        </div>

        {/* Hero Stats */}
        <div className="hero-stats">
          <div className="stat-item">
            <span className="stat-num">1.2M+</span>
            <span className="stat-label">Contacts Saved</span>
          </div>
          <div style={{ width: "1px", background: "var(--border-color)" }}></div>
          <div className="stat-item">
            <span className="stat-num">98.8%</span>
            <span className="stat-label">Accuracy Rate</span>
          </div>
          <div style={{ width: "1px", background: "var(--border-color)" }}></div>
          <div className="stat-item">
            <span className="stat-num">&lt; 2s</span>
            <span className="stat-label">Scrape Speed</span>
          </div>
        </div>
      </header>

      {/* Interactive Walkthrough Demo Section */}
      <section id="demo" className="landing-section">
        <div className="section-header">
          <h2>See It In Action</h2>
          <p>Scraping group contacts has never been this simple. Follow the three steps to export your data.</p>
        </div>

        <div className="demo-section-wrapper">
          {/* Steps selector */}
          <div className="demo-nav-steps">
            {steps.map((step, idx) => (
              <button
                key={idx}
                className={`demo-step-btn ${activeStep === idx ? "active" : ""}`}
                onClick={() => setActiveStep(idx)}
              >
                <div className="demo-step-num">{step.num}</div>
                <div className="demo-step-title">{step.title}</div>
                <div className="demo-step-desc">{step.desc}</div>
              </button>
            ))}
          </div>

          {/* Browser UI Mockup */}
          <div className="mock-browser-container">
            <div className="browser-header-row">
              <span className="browser-dot"></span>
              <span className="browser-dot dot-yellow"></span>
              <span className="browser-dot dot-green"></span>
              <div className="browser-url-bar">https://app.whatsappextractor.com/dashboard</div>
            </div>
            <div className="browser-body">
              <div className="mock-sidebar">
                <div className="mock-sidebar-item active"></div>
                <div className="mock-sidebar-item short"></div>
                <div className="mock-sidebar-item medium"></div>
                <div className="mock-sidebar-item short"></div>
                <div className="mock-sidebar-item short" style={{ marginTop: "auto" }}></div>
              </div>
              <div className="mock-content">
                {steps[activeStep].mockup}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Video Demonstration Section */}
      <section className="landing-section" style={{ borderTop: "1px solid var(--border-color)", paddingTop: "80px" }}>
        <div className="section-header">
          <h2>Watch Tutorial Video</h2>
          <p>Get a complete 2-minute walkthrough showing exactly how to set up, connect, filter, and download your sheets.</p>
        </div>

        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <div style={{
            position: "relative",
            paddingBottom: "56.25%", /* 16:9 ratio */
            height: 0,
            overflow: "hidden",
            borderRadius: "20px",
            border: "1px solid var(--border-color)",
            background: "rgba(15, 23, 42, 0.4)",
            boxShadow: "0 20px 40px rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(12px)"
          }}>
            {/* Standard HTML5 video or an embedded simulation */}
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              background: "linear-gradient(rgba(3, 7, 18, 0.5), rgba(3, 7, 18, 0.8))"
            }}>
              {/* Play symbol button with glowing effect */}
              <div style={{
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, var(--accent) 0%, #1ebe57 100%)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#030712",
                fontSize: "32px",
                boxShadow: "0 0 30px var(--accent-glow)",
                transition: "all 0.3s",
                paddingLeft: "6px"
              }}>
                ▶
              </div>
              <p style={{ marginTop: "20px", fontWeight: "600", fontSize: "15px", letterSpacing: "0.05em", color: "var(--text-primary)" }}>
                PLAY BOT DEMONSTRATION
              </p>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Duration: 2 mins • Secure Connection Demo</span>
            </div>
          </div>
        </div>
      </section>

      {/* Premium Features Section */}
      <section id="features" className="landing-section" style={{ borderTop: "1px solid var(--border-color)" }}>
        <div className="section-header">
          <h2>Built for Power Users</h2>
          <p>Supercharge your outreach and extraction workflows with our advanced enterprise-grade feature set.</p>
        </div>

        <div className="features-grid">
          <div className="feature-card">
            <div className="feature-icon-wrapper">🚀</div>
            <h3>Multi-Group Extraction</h3>
            <p>Select and scrape contacts from multiple groups simultaneously. Automatically merges entries into a single clean file.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon-wrapper">📊</div>
            <h3>File Splitting Tool</h3>
            <p>Avoid hitting WhatsApp DM sending limits. Set a custom batch size (e.g. 99 contacts per sheet) and download split files instantly.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon-wrapper">🔍</div>
            <h3>Smart Filters</h3>
            <p>Filter extracted numbers by specific country prefixes, exclude group administrators, or skip contacts that do not have a public username.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon-wrapper">🛡️</div>
            <h3>Safe Scrape Delays</h3>
            <p>Control the rate of extraction from 0ms to 500ms. Randomized micro-delays safeguard your accounts and mimic natural human scrolling.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon-wrapper">💬</div>
            <h3>Direct DM Delivery</h3>
            <p>No need to download files onto your computer. Send the compiled contact sheets directly to your own WhatsApp DM with one click.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon-wrapper">🌐</div>
            <h3>Offline Country Lookup</h3>
            <p>Instantly enrich scraped data with country names (e.g. Nigeria, USA, UK) computed offline based on phone number prefixes.</p>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="landing-section" style={{ borderTop: "1px solid var(--border-color)" }}>
        <div className="section-header">
          <h2>Transparent Tier Pricing</h2>
          <p>Choose the perfect plan for your scraping needs. Upgrade or downgrade anytime directly from the app.</p>
        </div>

        <div className="pricing-grid">
          {/* Free Tier */}
          <div className="pricing-card">
            <div className="pricing-header">
              <h3>Basic Free</h3>
              <p>Great for exploring capabilities</p>
            </div>
            <div className="pricing-price">
              ₦0 <span>/ forever</span>
            </div>
            <ul className="pricing-features-list">
              <li className="pricing-feature-item checked">Extracts 1/3 (33%) Contacts</li>
              <li className="pricing-feature-item checked">Excel & CSV Exports</li>
              <li className="pricing-feature-item checked">Offline Country Enrichment</li>
              <li className="pricing-feature-item checked">Rate-limit settings</li>
              <li className="pricing-feature-item unchecked">Send files to WhatsApp DM</li>
              <li className="pricing-feature-item unchecked">Export profiles & bio status</li>
            </ul>
            <Link href="/dashboard" className="pricing-btn">
              Get Started
            </Link>
          </div>

          {/* Pro Tier */}
          <div className="pricing-card popular">
            <div className="popular-badge">Most Popular</div>
            <div className="pricing-header">
              <h3>Pro Marketer</h3>
              <p>Ideal for growing agencies</p>
            </div>
            <div className="pricing-price">
              ₦2,500 <span>/ month</span>
            </div>
            <ul className="pricing-features-list">
              <li className="pricing-feature-item checked">Extracts 1/2 (50%) Contacts</li>
              <li className="pricing-feature-item checked">Excel & CSV Exports</li>
              <li className="pricing-feature-item checked">Offline Country Enrichment</li>
              <li className="pricing-feature-item checked">Rate-limit settings</li>
              <li className="pricing-feature-item checked">Send files to WhatsApp DM</li>
              <li className="pricing-feature-item unchecked">Export profiles & bio status</li>
            </ul>
            <Link href="/dashboard" className="pricing-btn">
              Upgrade to Pro
            </Link>
          </div>

          {/* Unlimited Tier */}
          <div className="pricing-card">
            <div className="pricing-header">
              <h3>Unlimited Enterprise</h3>
              <p>For high-volume bulk users</p>
            </div>
            <div className="pricing-price">
              ₦4,000 <span>/ month</span>
            </div>
            <ul className="pricing-features-list">
              <li className="pricing-feature-item checked">Extracts 100% of Contacts</li>
              <li className="pricing-feature-item checked">Excel & CSV Exports</li>
              <li className="pricing-feature-item checked">Offline Country Enrichment</li>
              <li className="pricing-feature-item checked">Rate-limit settings</li>
              <li className="pricing-feature-item checked">Send files to WhatsApp DM</li>
              <li className="pricing-feature-item checked">Fetch Profiles & About Statuses</li>
            </ul>
            <Link href="/dashboard" className="pricing-btn">
              Go Unlimited
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-info">
            <div className="logo-area" style={{ marginBottom: "8px" }}>
              <img src="/logo.png" alt="Logo" style={{ width: "24px", height: "24px", borderRadius: "6px" }} />
              <span className="footer-logo">WhatsApp Extractor</span>
            </div>
            <p className="footer-copyright">© 2026 WhatsApp Extractor Bot. All rights reserved.</p>
          </div>
          <div className="footer-disclaimer">
            Disclaimer: This application is an independent marketing utility tool and is not affiliated, associated, authorized, endorsed by, or in any way officially connected with Meta Platforms Inc. or WhatsApp Inc.
          </div>
        </div>
      </footer>
    </div>
  );
}
