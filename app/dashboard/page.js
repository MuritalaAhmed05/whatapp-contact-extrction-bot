"use client";

import { useEffect, useState, useRef } from "react";
import io from "socket.io-client";
import { supabase } from "../../lib/supabaseClient";

export default function Dashboard() {
  const [socket, setSocket] = useState(null);
  
  // App State
  const [clientState, setClientState] = useState("disconnected"); // disconnected, authenticating, ready, extracting
  const [qrCode, setQrCode] = useState(null);
  const [pairingCode, setPairingCode] = useState(null);
  const [qrExpired, setQrExpired] = useState(false);
  const [logs, setLogs] = useState([]);
  const [profile, setProfile] = useState(null);
  const [userTier, setUserTier] = useState("free");
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const profileRef = useRef(null);
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);
  const [groups, setGroups] = useState([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  
  // UI State
  const [activeTab, setActiveTab] = useState("qr");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isMultiSelect, setIsMultiSelect] = useState(false);
  
  // Form State
  const [countryCode, setCountryCode] = useState("234");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [enrichData, setEnrichData] = useState(true);
  const [fetchProfilePics, setFetchProfilePics] = useState(false);
  const [fetchAboutStatus, setFetchAboutStatus] = useState(false);
  const [excludeAdmins, setExcludeAdmins] = useState(false);
  const [excludeSaved, setExcludeSaved] = useState(false);
  const [countryFilter, setCountryFilter] = useState("");
  const [delayMs, setDelayMs] = useState(100);
  const [spamConsent, setSpamConsent] = useState(false);
  
  // Progress & Download State
  const [progress, setProgress] = useState(null);
  const [extractionResults, setExtractionResults] = useState(null);
  const [combinedFile, setCombinedFile] = useState(null);
  const [activeFormat, setActiveFormat] = useState("csv");
  const [extractionLimitInfo, setExtractionLimitInfo] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyFormats, setHistoryFormats] = useState({});
  const [isSendingDm, setIsSendingDm] = useState(false);
  const [requestingCode, setRequestingCode] = useState(false);
  const [isSplit, setIsSplit] = useState(false);
  const [splitSize, setSplitSize] = useState(99);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  const [isSendingAll, setIsSendingAll] = useState(false);

  // Custom UI Modals & Toasts
  const [toasts, setToasts] = useState([]);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const addToast = (message, type = "error") => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const logsEndRef = useRef(null);

  useEffect(() => {
    if (profile && profile.number) {
      fetchHistory(profile.number);
    } else {
      setHistory([]);
    }
  }, [profile]);

  const fetchHistory = async (phoneNumber) => {
    const { data, error } = await supabase
      .from('recent_extractions')
      .select('*')
      .eq('phone_number', phoneNumber)
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error("Supabase Fetch Error:", error);
      return;
    }

    if (data) {
      setHistory(data.map(d => ({
        id: d.id,
        fileId: d.file_id,
        groupName: d.group_name,
        count: d.contact_count,
        date: d.date
      })));
    }
  };

  const saveToHistory = async (item) => {
    const currentProfile = profileRef.current;
    if (!currentProfile || !currentProfile.number) return; // Only save if WhatsApp connected

    const phoneNumber = currentProfile.number;

    const { data, error } = await supabase
      .from('recent_extractions')
      .insert([{
        phone_number: phoneNumber,
        file_id: item.fileId,
        group_name: item.groupName,
        contact_count: item.count,
        date: item.date
      }])
      .select();

    if (error) {
      console.error("Supabase Insert Error:", error);
      addToast("Failed to save to history: " + error.message, "error");
    }

    if (data && data.length > 0) {
      const inserted = data[0];
      setHistory((prev) => {
        let newHist = prev.filter((h) => h.fileId !== inserted.file_id);
        newHist.unshift({
          id: inserted.id,
          fileId: inserted.file_id,
          groupName: inserted.group_name,
          count: inserted.contact_count,
          date: inserted.date
        });
        if (newHist.length > 10) newHist.pop();
        return newHist;
      });
    }
  };

  const deleteHistoryItem = (id, groupName) => {
    setConfirmDialog({
      title: "Delete Extraction",
      message: `Are you sure you want to delete the extraction for "${groupName}"?`,
      confirmText: "Delete",
      onConfirm: async () => {
        setConfirmDialog(null);
        if (!profile || !profile.number) return;
        const { error } = await supabase.from('recent_extractions').delete().eq('id', id);
        if (!error) {
          setHistory(prev => prev.filter(h => h.id !== id));
          addToast(`Deleted "${groupName}" successfully`, "success");
        } else {
          console.error("Supabase Delete Error:", error);
          addToast(`Failed to delete "${groupName}": ${error.message}`, "error");
        }
      }
    });
  };

  useEffect(() => {
    if (profile && profile.number) {
      supabase.from('user_subscriptions')
        .select('tier')
        .eq('phone_number', profile.number)
        .single()
        .then(({ data }) => {
          if (data && data.tier) {
            setUserTier(data.tier);
          }
        });
    }
  }, [profile]);

  useEffect(() => {
    let storedSessionId = localStorage.getItem("wa_session_id");
    if (!storedSessionId) {
      storedSessionId = crypto.randomUUID();
      localStorage.setItem("wa_session_id", storedSessionId);
    }

    const newSocket = io(window.location.origin, {
      query: { sessionId: storedSessionId }
    });
    setSocket(newSocket);

    const updateState = (state, qr, code, expired) => {
      setClientState(state);
      setQrExpired(!!expired);
      if (qr) setQrCode(qr);
      else if (expired) setQrCode(null);

      if (code) {
        setPairingCode(code);
        setActiveTab("phone");
      } else if (expired) {
        setPairingCode(null);
      }

      if (state === "ready") {
        setQrCode(null);
        setPairingCode(null);
      }
      if (state === "disconnected") {
        setGroups([]);
        setSelectedGroupIds([]);
        setExtractionResults(null);
        setProgress(null);
        setProfile(null);
        setIsLoggingOut(false);
        setConfirmDialog(null);
      }
    };

    newSocket.on("init", ({ state, qr, code, logs, qrExpired }) => {
      updateState(state, qr, code, qrExpired);
      if (logs) setLogs(logs);
      else setLogs(["🔄 Connected to server. Awaiting logs..."]);
    });

    newSocket.on("status", ({ state, qr, code, qrExpired }) => {
      updateState(state, qr, code, qrExpired);
      if (state === "ready" || state === "authenticating") {
        setRequestingCode(false);
      }
    });

    newSocket.on("session-profile", (data) => setProfile(data));

    newSocket.on("log", (msg) => {
      setLogs((prev) => [...prev, msg]);
    });

    newSocket.on("extraction-progress", (data) => {
      setProgress(data);
    });

    newSocket.on("groups-loaded", ({ groups }) => {
      setGroups(groups || []);
      setSelectedGroupIds([]);
    });

    newSocket.on("extraction-complete", ({ results, combined, wasLimited, originalContactCount, tier }) => {
      if (!results || results.length === 0) {
        setLogs((prev) => [...prev, "❌ Extraction completed but no files were returned."]);
        return;
      }
      setProgress(null);
      setExtractionResults(results);
      setCombinedFile(combined);
      setIsSplit(false);
      setExtractionLimitInfo(wasLimited ? { originalContactCount, tier } : null);

      const date = new Date().toLocaleString();
      if (combined) {
        // Only save the combined file to prevent duplicate spam in history
        saveToHistory({ ...combined, date, count: results.reduce((a, b) => a + b.count, 0) });
      } else {
        // Only 1 group selected, save it individually
        results.forEach(res => {
          saveToHistory({ ...res, date });
        });
      }
    });

    newSocket.on("extraction-error", (msg) => {
      addToast(msg, "error");
      setProgress(null);
      setRequestingCode(false);
    });

    newSocket.on("send-to-dm-response", ({ success, message, groupName, chunkIndex, chunkSize }) => {
      setIsSendingDm(false);
      const partLabel = (chunkIndex !== undefined && chunkIndex !== null) ? `${groupName} Part ${chunkIndex + 1}` : groupName;
      if (success) {
        setLogs(prev => [...prev, `✅ Successfully sent "${partLabel}" to your WhatsApp DM!`]);
      } else {
        setLogs(prev => [...prev, `❌ Failed to send to DM: ${message}`]);
      }
    });

    newSocket.on("rate-limit-error", (data) => {
      addToast(data.message, "error");
      setShowUpgradeModal(true);
    });

    return () => newSocket.disconnect();
  }, []);

  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollTop = logsEndRef.current.scrollHeight;
    }
  }, [logs]);

  const handleRequestPairingCode = (e) => {
    e.preventDefault();
    let fullNumber = countryCode === "custom" ? phoneNumber.trim() : countryCode + phoneNumber.trim();
    if (!fullNumber) return;
    setRequestingCode(true);
    socket.emit("request-pairing-code", { phoneNumber: fullNumber });
  };

  const handleCancelPairing = () => {
    socket.emit("cancel-pairing-code");
    setPairingCode(null);
    setRequestingCode(false);
    setActiveTab("qr");
  };

  const handleCopyCode = () => {
    if (pairingCode) {
      const cleanCode = pairingCode.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
      navigator.clipboard.writeText(cleanCode);
      addToast("Pairing code copied to clipboard!", "success");
    }
  };

  const handleExtract = (e) => {
    if (e) e.preventDefault();
    if (selectedGroupIds.length === 0) return addToast("Select at least one group.", "error");
    if (!spamConsent) return addToast("Please agree to the Anti-Spam notice to proceed.", "error");

    const executeExtraction = () => {
      setExtractionResults(null);
      setCombinedFile(null);
      setProgress(null);
      setExtractionLimitInfo(null);

      socket.emit("extract-contacts", {
        groupIds: selectedGroupIds,
        enrichData,
        fetchProfilePics,
        fetchAboutStatus,
        excludeAdmins,
        excludeSaved,
        countryFilter,
        delayMs: parseInt(delayMs)
      });
    };

    if (enrichData && delayMs === 0) {
      setConfirmDialog({
        title: "High Risk of Ban",
        message: "Setting delay to 0ms with Data Enrichment active may result in temporary WhatsApp restriction. Proceed anyway?",
        confirmText: "Proceed Anyway",
        onConfirm: () => {
          setConfirmDialog(null);
          executeExtraction();
        }
      });
      return;
    }

    executeExtraction();
  };

  const triggerDownload = async (fileId, format, label, chunkIndex = null, chunkSize = null) => {
    if (!fileId || fileId === "undefined") {
      setLogs(p => [...p, "❌ Download error: File ID is missing."]);
      return;
    }
    let url = `/download/${fileId}?format=${format}`;
    if (chunkIndex !== null && chunkSize !== null) {
      url += `&chunkIndex=${chunkIndex}&chunkSize=${chunkSize}`;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) {
        const msg = await res.text();
        setLogs(p => [...p, `❌ Download failed: ${msg}`]);
        return;
      }
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"\\n]+)"?/);
      const filename = match ? match[1] : `${label || fileId}.${format}`;

      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      setTimeout(() => URL.revokeObjectURL(objectUrl), 5000);

      const displayLabel = (chunkIndex !== null) ? `${label} Part ${chunkIndex + 1}` : label;
      setLogs(p => [...p, `💾 Downloaded “${displayLabel}” as .${format.toUpperCase()}`]);
    } catch (err) {
      setLogs(p => [...p, `❌ Download error: ${err.message}`]);
    }
  };

  const sendToDM = (fileId, groupName, chunkIndex = null, chunkSize = null) => {
    if (!fileId) return;
    setIsSendingDm(true);
    const displayLabel = (chunkIndex !== null) ? `${groupName} Part ${chunkIndex + 1}` : groupName;
    setLogs(p => [...p, `💬 Preparing to send "${displayLabel}" contacts as .${activeFormat.toUpperCase()} to your WhatsApp DM...`]);
    socket.emit("send-to-dm", { fileId, groupName, format: activeFormat, chunkIndex, chunkSize });
  };

  const downloadAllChunks = async (fileId, label, totalCount) => {
    if (isDownloadingAll) return;
    setIsDownloadingAll(true);
    setLogs(p => [...p, `📥 Starting batch download for "${label}" (${totalCount} contacts in parts)...`]);
    const totalParts = Math.ceil(totalCount / splitSize);
    
    for (let i = 0; i < totalParts; i++) {
      await triggerDownload(fileId, activeFormat, label, i, splitSize);
      await new Promise(r => setTimeout(r, 500));
    }
    
    setIsDownloadingAll(false);
    setLogs(p => [...p, `✅ Batch download complete for "${label}".`]);
  };

  const sendAllChunksSequentially = async (fileId, groupName, totalCount) => {
    if (isSendingAll) return;
    setIsSendingAll(true);
    setLogs(p => [...p, `📤 Starting batch DM transfer for "${groupName}" in parts...`]);
    const totalParts = Math.ceil(totalCount / splitSize);
    
    for (let i = 0; i < totalParts; i++) {
      sendToDM(fileId, groupName, i, splitSize);
      await new Promise((resolve) => {
        const handleResponse = (res) => {
          if (res.fileId === fileId && res.chunkIndex === i) {
            socket.off("send-to-dm-response", handleResponse);
            setTimeout(resolve, 1000);
          }
        };
        socket.on("send-to-dm-response", handleResponse);
      });
    }
    
    setIsSendingAll(false);
    setLogs(p => [...p, `✅ Batch DM transfer complete for "${groupName}".`]);
  };

  const toggleGroupSelection = (id, name) => {
    if (isMultiSelect) {
      if (selectedGroupIds.includes(id)) {
        setSelectedGroupIds(selectedGroupIds.filter(g => g !== id));
      } else {
        setSelectedGroupIds([...selectedGroupIds, id]);
      }
    } else {
      if (selectedGroupIds.includes(id)) {
        setSelectedGroupIds([]);
      } else {
        setSelectedGroupIds([id]);
        setLogs(p => [...p, `🎯 Selected group: "${name}"`]);
      }
    }
  };

  const filteredGroups = groups.filter(g => g.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const totalExtractedContacts = extractionResults ? extractionResults.reduce((s, r) => s + r.count, 0) : 0;
  
  const renderCodeBlocks = (code) => {
    if (!code) return null;
    const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
    return clean.split("").map((char, i) => (
      <span key={i} className="code-char">{char}</span>
    ));
  };

  // Convert log array to string HTML format simulating the old appendLog behavior
  const formattedLogs = logs.map((log) => {
    let color = "inherit";
    if (log.includes("✅") || log.includes("successfully") || log.includes("complete")) color = "#10b981";
    else if (log.includes("❌") || log.includes("Error:") || log.includes("failed")) color = "#ef4444";
    else if (log.includes("⏳") || log.includes("🔄") || log.includes("Starting") || log.includes("⚠️")) color = "#f59e0b";
    else if (log.includes("📱") || log.includes("🔌") || log.includes("🔑")) color = "#60a5fa";
    
    return `<div class="log-entry" style="color: ${color}">${log}</div>`;
  }).join("");

  return (
    <div className="dashboard-layout">
      <div className="blob-bg">
        <div className="blob blob-1"></div>
        <div className="blob blob-2"></div>
        <div className="blob blob-3"></div>
      </div>
      <div className="app-container">
        {/* Header */}
        <header className="app-header">
          <div className="logo-area">
            <img src="/logo.png" alt="Logo" style={{ width: '46px', height: '46px', borderRadius: '12px', boxShadow: '0 0 15px rgba(37,211,102,0.4)' }} />
            <div className="logo-text">
              <h1>WhatsApp Extractor</h1>
              <p>Extract group contacts quickly and securely</p>
            </div>
          </div>
          <div className="status-indicator-wrapper">
            <span className={`status-badge ${clientState}`} id="connection-badge">
              <span className="status-dot"></span>
              <span className="status-label capitalize" id="connection-label">
                {clientState === "disconnected" ? "Disconnected" : 
                 clientState === "authenticating" ? "Authenticating..." : 
                 clientState === "ready" ? "Connected & Ready" : 
                 clientState === "extracting" ? "Extracting..." : clientState}
              </span>
            </span>
          </div>
        </header>

        {/* Main Workspace */}
        <div className="workspace-grid">
          {/* Left Panel: Connection & Extraction Control */}
          <div className="panel control-panel">
            <div className="panel-header">
              <h2>Connection & Control</h2>
            </div>

            <div className="auth-section">
              {/* Unauthenticated Connection Flow */}
              {(clientState === "disconnected" || clientState === "authenticating") && (
                <div id="unauth-flow-wrapper" className="unauth-flow-wrapper">
                  {/* Navigation Tabs */}
                  <div className="connection-tabs">
                    <button type="button" className={`tab-btn ${activeTab === "qr" ? "active" : ""}`} onClick={() => setActiveTab("qr")}>
                      Scan QR Code
                    </button>
                    <button type="button" className={`tab-btn ${activeTab === "phone" ? "active" : ""}`} onClick={() => setActiveTab("phone")}>
                      Link with Phone
                    </button>
                  </div>

                  {/* Tab Content: QR Code */}
                  {activeTab === "qr" && (
                    <div id="qr-tab-content" className="tab-content-panel">
                      <div className="qr-container" id="qr-container">
                        {qrExpired ? (
                          <div className="qr-placeholder" id="qr-expired-placeholder" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', height: '100%', textAlign: 'center', padding: '10px', color: '#1e293b' }}>
                            <p style={{ color: '#64748b', fontSize: '13px', lineHeight: '1.4', margin: 0, fontWeight: '600' }}>
                              ⚠️ Connection session timed out.
                            </p>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={() => {
                                setQrExpired(false);
                                setQrCode(null);
                                if (socket) socket.emit("initialize-client");
                              }}
                              style={{ padding: '6px 14px', fontSize: '12px', width: 'auto', minHeight: 'auto' }}
                            >
                              Restart Connection
                            </button>
                          </div>
                        ) : qrCode && clientState !== "authenticating" ? (
                          <img id="qr-image" src={qrCode} alt="WhatsApp QR Code" />
                        ) : (
                          <div className="qr-placeholder" id="qr-placeholder">
                            <span className="spinner"></span>
                            <p>{clientState === "authenticating" ? "Authenticating session..." : "Generating QR Code..."}</p>
                          </div>
                        )}
                      </div>
                      {!qrExpired && (
                        <p className="qr-instruction mt-2" style={{ marginTop: '24px' }}>
                          Scan this QR code using WhatsApp on your phone (Linked Devices &rarr; Link a Device)
                        </p>
                      )}
                    </div>
                  )}

                  {/* Tab Content: Phone Link */}
                  {activeTab === "phone" && (
                    <div id="phone-tab-content" className="tab-content-panel">
                      {qrExpired ? (
                        <div className="phone-expired-wrapper" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', minHeight: '220px', textAlign: 'center' }}>
                          <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.4', margin: 0, fontWeight: '500' }}>
                            ⚠️ Connection session timed out due to inactivity.
                          </p>
                          <button
                            type="button"
                            className="btn btn-primary"
                            onClick={() => {
                              setQrExpired(false);
                              setPairingCode(null);
                              if (socket) socket.emit("initialize-client");
                            }}
                            style={{ padding: '8px 16px', fontSize: '13px', width: 'auto' }}
                          >
                            Restart Connection
                          </button>
                        </div>
                      ) : !pairingCode ? (
                        <form id="phone-linking-form" className="phone-form" onSubmit={handleRequestPairingCode}>
                          <div className="form-row">
                            <div className="form-group select-group">
                              <label htmlFor="country-code-select">Country</label>
                              <select id="country-code-select" className="country-select" value={countryCode} onChange={e => setCountryCode(e.target.value)}>
                                <option value="234">🇳🇬 Nigeria (+234)</option>
                                <option value="1">🇺🇸/🇨🇦 USA/Canada (+1)</option>
                                <option value="44">🇬🇧 UK (+44)</option>
                                <option value="91">🇮🇳 India (+91)</option>
                                <option value="27">🇿🇦 South Africa (+27)</option>
                                <option value="254">🇰🇪 Kenya (+254)</option>
                                <option value="233">🇬🇭 Ghana (+233)</option>
                                <option value="custom">Other...</option>
                              </select>
                            </div>
                            <div className="form-group input-group">
                              <label htmlFor="phone-number-input">Phone Number</label>
                              <div className="phone-number-input-wrapper">
                                <span id="phone-prefix-display" className="phone-prefix-span">
                                  {countryCode === "custom" ? "+" : `+${countryCode}`}
                                </span>
                                <input
                                  type="text"
                                  id="phone-number-input"
                                  placeholder={countryCode === "custom" ? "e.g. 2348012345678" : "8012345678"}
                                  autoComplete="off"
                                  required
                                  value={phoneNumber}
                                  onChange={e => setPhoneNumber(e.target.value)}
                                  disabled={requestingCode || clientState === "authenticating"}
                                />
                              </div>
                            </div>
                          </div>
                          <button type="submit" id="btn-get-code" className="btn btn-primary" disabled={requestingCode || clientState === "authenticating"}>
                            <span>{requestingCode ? "Requesting..." : "Generate Pairing Code"}</span>
                          </button>
                        </form>
                      ) : (
                        <div id="pairing-code-display-wrapper" className="pairing-code-display-wrapper">
                          <p className="pairing-code-title">Your Pairing Code:</p>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>
                            <div className="code-blocks" id="code-blocks-container" style={{ marginBottom: 0 }}>
                              {renderCodeBlocks(pairingCode)}
                            </div>
                            <button 
                              type="button" 
                              onClick={handleCopyCode} 
                              className="btn btn-secondary"
                              style={{ width: '42px', height: '42px', padding: 0, minWidth: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: 'var(--radius-sm)' }}
                              title="Copy Code"
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            </button>
                          </div>
                          <button type="button" id="btn-cancel-pairing" className="btn btn-secondary mt-12" onClick={handleCancelPairing}>
                            <span>Cancel & Show QR</span>
                          </button>
                        </div>
                      )}

                      <div className="phone-instructions">
                        <h5>How to use the Pairing Code:</h5>
                        <ol>
                          <li>Open <strong>WhatsApp</strong> on your phone.</li>
                          <li>Go to <strong>Settings</strong> &rarr; <strong>Linked Devices</strong>.</li>
                          <li>Tap <strong>Link a Device</strong>.</li>
                          <li>Tap <strong>Link with phone number instead</strong> at the bottom.</li>
                          <li>Enter the 8-character code shown above.</li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Connected State */}
              {(clientState === "ready" || clientState === "extracting") && (
                <div id="connected-wrapper" className="connected-wrapper">
                  <div className="profile-card">
                    <img
                      id="profile-avatar"
                      src={profile?.avatar || "https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png"}
                      alt="Profile Picture"
                      className="profile-avatar"
                    />
                    <div className="profile-info">
                      <h3 id="profile-name">{profile?.name || "WhatsApp User"}</h3>
                      <p id="profile-number">+{profile?.number || "000 00000000"}</p>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                      <button 
                        onClick={() => setShowUpgradeModal(true)}
                        className={`tier-badge-pill ${userTier === 'free' ? 'tier-free' : 'tier-pro'}`}
                      >
                        {userTier.toUpperCase()} PLAN
                      </button>
                    </div>
                  </div>
                    <button 
                      className="btn btn-disconnect" 
                      onClick={() => {
                        setConfirmDialog({
                          title: "Disconnect WhatsApp",
                          message: "Are you sure you want to log out and terminate the WhatsApp session?",
                          confirmText: "Disconnect",
                          onConfirm: () => {
                            setIsLoggingOut(true);
                            socket.emit("logout-whatsapp");
                          }
                        });
                      }}
                    ><span>Logout Session</span>
                  </button>
                </div>
              )}
            </div>

            {/* Extraction Interface */}
            <div className="extraction-section">
              <div className="panel-header sub-header">
                <h2>Extract Group Contacts</h2>
              </div>
              <form id="extraction-form" onSubmit={handleExtract}>
                <div className="form-group">
                  <div className="group-select-header">
                    <label>Select Target Group(s)</label>
                    <div className="multi-select-toggle-wrapper">
                      <input
                        type="checkbox"
                        id="chk-multi-select"
                        className="custom-checkbox-toggle"
                        checked={isMultiSelect}
                        onChange={e => {
                          setIsMultiSelect(e.target.checked);
                          setSelectedGroupIds([]);
                        }}
                      />
                      <label htmlFor="chk-multi-select" className="toggle-label-text">Multi-group mode</label>
                    </div>
                  </div>
                  <input
                    type="text"
                    id="group-search-input"
                    className="group-search-input"
                    placeholder={clientState === "ready" ? "🔍 Search groups..." : "Awaiting WhatsApp connection..."}
                    autoComplete="off"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    disabled={clientState !== "ready"}
                  />
                  <div id="group-list-wrapper" className="group-list-wrapper">
                    {clientState !== "ready" ? (
                      <div className="group-list-placeholder" id="group-list-placeholder">
                        {clientState === "extracting" ? "Extracting in progress..." : "Awaiting WhatsApp connection..."}
                      </div>
                    ) : groups.length === 0 ? (
                      <div className="group-list-placeholder">
                        ⏳ Loading your groups...
                      </div>
                    ) : filteredGroups.length === 0 ? (
                      <div className="group-list-placeholder">
                        No groups found.
                      </div>
                    ) : (
                      <div className="group-list-grid" id="group-list-grid">
                        {filteredGroups.map(g => (
                          <div
                            key={g.id}
                            className={`group-card ${selectedGroupIds.includes(g.id) ? "selected" : ""}`}
                            onClick={() => toggleGroupSelection(g.id, g.name)}
                          >
                            <span className="group-card-name">{g.name}</span>
                            <div className="group-card-indicator"></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <input type="hidden" id="selected-group-ids" value={JSON.stringify(selectedGroupIds)} />
                </div>

                {/* Advanced Settings Drawer Toggle */}
                <div className="settings-drawer-toggle" id="settings-drawer-toggle" onClick={() => setIsSettingsOpen(!isSettingsOpen)}>
                  <span>⚙️ Advanced Settings</span>
                  <span className="chevron-icon" id="settings-chevron">{isSettingsOpen ? "▲" : "▼"}</span>
                </div>

                {/* Advanced Settings Panel Content */}
                <div className={`settings-drawer-content ${isSettingsOpen ? "expanded" : "collapsed"}`} id="settings-drawer-content">
                  <div className="settings-grid">
                    <div className="form-group-checkbox">
                      <input type="checkbox" id="chk-enrich-data" checked={enrichData} onChange={e => setEnrichData(e.target.checked)} />
                      <label htmlFor="chk-enrich-data">Enrich Data (Name, Pushname, Business info)</label>
                    </div>
                    {enrichData && (
                      <div style={{ marginLeft: '28px', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                        <div className="form-group-checkbox" style={{ marginBottom: 0 }}>
                          <input type="checkbox" id="chk-fetch-pics" checked={fetchProfilePics} onChange={e => setFetchProfilePics(e.target.checked)} />
                          <label htmlFor="chk-fetch-pics" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>Fetch Profile Pictures (Slower)</label>
                        </div>
                        <div className="form-group-checkbox" style={{ marginBottom: 0 }}>
                          <input type="checkbox" id="chk-fetch-about" checked={fetchAboutStatus} onChange={e => setFetchAboutStatus(e.target.checked)} />
                          <label htmlFor="chk-fetch-about" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>Fetch &apos;About&apos; Bio Status (Slower)</label>
                        </div>
                      </div>
                    )}
                    <div className="form-group-checkbox">
                      <input type="checkbox" id="chk-exclude-admins" checked={excludeAdmins} onChange={e => setExcludeAdmins(e.target.checked)} />
                      <label htmlFor="chk-exclude-admins">Exclude Group Admins</label>
                    </div>
                    <div className="form-group-checkbox">
                      <input type="checkbox" id="chk-exclude-saved" checked={excludeSaved} onChange={e => setExcludeSaved(e.target.checked)} />
                      <label htmlFor="chk-exclude-saved">Exclude Saved Contacts (Already in address book)</label>
                    </div>
                    <div className="form-group">
                      <label htmlFor="input-country-filter">Filter by Country Code</label>
                      <input
                        type="text"
                        id="input-country-filter"
                        placeholder="e.g. 234, 1 (comma-separated)"
                        autoComplete="off"
                        value={countryFilter}
                        onChange={e => setCountryFilter(e.target.value)}
                        className="premium-input"
                        style={{ marginTop: '4px' }}
                      />
                    </div>
                    <div className="form-group">
                      <div className="slider-label-row">
                        <label htmlFor="slider-fetch-delay">Fetch Delay per Contact</label>
                        <span id="delay-value-display">
                          {delayMs}ms 
                          <span style={{ 
                            fontSize: '11px', 
                            color: delayMs < 100 ? '#ef4444' : delayMs < 250 ? '#eab308' : '#22c55e', 
                            marginLeft: '6px', 
                            fontWeight: 'bold' 
                          }}>
                            ({delayMs == 0 ? 'risky' : delayMs < 100 ? 'fast' : delayMs < 250 ? 'safe' : 'very safe'})
                          </span>
                        </span>
                      </div>
                      <input
                        type="range"
                        id="slider-fetch-delay"
                        min="0"
                        max="500"
                        step="50"
                        value={delayMs}
                        onChange={e => setDelayMs(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Anti-Spam Consent Checkbox */}
                <div className="form-group-checkbox consent-box">
                  <input type="checkbox" id="chk-spam-consent" checked={spamConsent} onChange={e => setSpamConsent(e.target.checked)} />
                  <label htmlFor="chk-spam-consent" className="consent-label">I agree not to use these numbers for sending spam. 🚫</label>
                </div>

                <button type="submit" id="btn-extract" className="btn btn-primary" disabled={!spamConsent || selectedGroupIds.length === 0 || clientState === "extracting"}>
                  <span>{clientState === "extracting" ? "Extracting..." : "Start Extraction"}</span>
                </button>
              </form>
            </div>

            {/* Educational disclaimer warning */}
            <div className="disclaimer-box">
              <span className="warning-icon">⚠️</span>
              <p className="disclaimer-text">
                <strong>Educational Notice:</strong> This tool is for educational purposes. Excessive automated scraping may result in WhatsApp account restrictions.
              </p>
            </div>
          </div>

          {/* Right Panel: Logs & Download */}
          <div className="panel logs-panel">
            <div className="panel-header">
              <h2>Activity Log</h2>
              <button id="btn-clear-logs" className="btn-clear" onClick={() => setLogs(["🧹 Log console cleared locally."])}>Clear Logs</button>
            </div>

            {/* Progress Bar Section */}
            <div className={`progress-bar-container ${progress ? "" : "hidden"}`} id="progress-bar-container">
              <div className="progress-bar-label-row">
                <span id="progress-status-text">
                  {progress ? `Fetching details: ${progress.processed} / ${progress.total} contacts...` : "Fetching details..."}
                </span>
                <span id="progress-percent-text">{progress ? `${progress.percent}%` : "0%"}</span>
              </div>
              <div className="progress-bar-track">
                <div className="progress-bar-fill" id="progress-bar-fill" style={{ width: `${progress ? progress.percent : 0}%` }}></div>
              </div>
            </div>

            {/* Log Console */}
            <div className="log-console-wrapper">
              <div className="log-console" id="log-console" ref={logsEndRef} dangerouslySetInnerHTML={{ __html: formattedLogs }}>
              </div>
            </div>

            {/* Download Card Area */}
            <div className="download-container">
              <div className={`download-card ${extractionResults ? "active" : "disabled"}`} id="download-card">
                <div className="download-info">
                  <span className="file-icon">📄</span>
                  <div className="file-details">
                    <h4 id="download-title">
                      {extractionResults 
                        ? (extractionResults.length === 1 ? `Extraction Complete — ${extractionResults[0].groupName}` : `Extraction Complete — ${extractionResults.length} Groups`) 
                        : "No file generated yet"}
                    </h4>
                    <p id="download-subtitle">
                      {extractionResults ? `${totalExtractedContacts} contacts total. Choose format and download:` : "Run an extraction to download contact list"}
                    </p>
                  </div>
                </div>

                {/* Limit Notification banner to push user to subscribe */}
                {extractionResults && extractionLimitInfo && (
                  <div className="limit-banner" style={{
                    background: extractionLimitInfo.tier === 'pro' ? 'rgba(168, 85, 247, 0.08)' : 'rgba(234, 179, 8, 0.08)',
                    border: extractionLimitInfo.tier === 'pro' ? '1px dashed rgba(168, 85, 247, 0.3)' : '1px dashed rgba(234, 179, 8, 0.3)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    marginTop: '4px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    animation: 'fadeIn 0.3s ease-out'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '18px' }}>⚠️</span>
                      <span style={{ fontSize: '13px', fontWeight: '600', color: extractionLimitInfo.tier === 'pro' ? '#c084fc' : '#fef08a' }}>
                        {extractionLimitInfo.tier === 'pro' ? 'Pro Plan Limit Applied' : 'Free Tier Limit Applied'}
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255, 255, 255, 0.8)', lineHeight: '1.4' }}>
                      {extractionLimitInfo.tier === 'pro' ? (
                        <>
                          Only <strong>1/2</strong> of the contacts (<strong>{totalExtractedContacts}</strong> out of <strong>{extractionLimitInfo.originalContactCount}</strong>) were extracted because the <strong>Pro Plan</strong> is capped at 50% contacts per group.
                        </>
                      ) : (
                        <>
                          Only <strong>1/3</strong> of the contacts (<strong>{totalExtractedContacts}</strong> out of <strong>{extractionLimitInfo.originalContactCount}</strong>) were extracted because you are on the <strong>Free tier</strong>.
                        </>
                      )}
                    </p>
                    <button 
                      type="button" 
                      onClick={() => setShowUpgradeModal(true)} 
                      style={{
                        alignSelf: 'flex-start',
                        background: extractionLimitInfo.tier === 'pro' ? 'linear-gradient(90deg, #a855f7 0%, #7c3aed 100%)' : 'linear-gradient(90deg, #eab308 0%, #ca8a04 100%)',
                        color: extractionLimitInfo.tier === 'pro' ? '#fff' : '#000',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '6px 12px',
                        fontSize: '11px',
                        fontWeight: '700',
                        cursor: 'pointer',
                        marginTop: '4px',
                        transition: 'transform 0.2s'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.03)'}
                      onMouseOut={(e) => e.currentTarget.style.transform = 'none'}
                    >
                      {extractionLimitInfo.tier === 'pro' ? '🚀 Upgrade to Unlimited for 100% Contacts' : '🚀 Upgrade to Pro / Unlimited for 100% Contacts'}
                    </button>
                  </div>
                )}

                {/* Format Selector for Download */}
                <div className={`download-actions-row ${extractionResults ? "" : "hidden"}`} id="download-actions-row">
                  <div className="format-select-wrapper">
                    <select id="download-format-select" className="format-select" value={activeFormat} onChange={e => setActiveFormat(e.target.value)}>
                      <option value="txt">Plain Text (.txt)</option>
                      <option value="csv">CRM Sheet (.csv)</option>
                      <option value="xlsx">Excel Spreadsheet (.xlsx)</option>
                      <option value="vcf">Phone vCard (.vcf)</option>
                    </select>
                  </div>
                  
                  {extractionResults && (combinedFile || extractionResults.length === 1) && (
                    <>
                      <a
                        id="btn-download"
                        href="#"
                        className={`btn btn-download-action ${isSplit ? "hidden" : ""}`}
                        onClick={(e) => {
                          e.preventDefault();
                          const target = combinedFile || extractionResults[0];
                          triggerDownload(target.fileId, activeFormat, target.groupName);
                        }}
                      >
                        <span>⬇ Download</span>
                      </a>
                      <button
                        id="btn-send-to-dm"
                        className={`btn btn-send-dm ${isSplit ? "hidden" : ""}`}
                        type="button"
                        disabled={isSendingDm}
                        onClick={() => {
                          const target = combinedFile || extractionResults[0];
                          sendToDM(target.fileId, target.groupName);
                        }}
                      >
                        <span>{isSendingDm ? "Sending..." : "💬 Send to my DM"}</span>
                      </button>
                    </>
                  )}
                </div>

                {/* File Splitting Options */}
                {extractionResults && (combinedFile || extractionResults.length === 1) && (
                  <>
                    <div className="split-controls-row" id="split-controls-row">
                      <div className="form-group-checkbox inline-checkbox">
                        <input 
                          type="checkbox" 
                          id="chk-split-files" 
                          checked={isSplit} 
                          onChange={e => setIsSplit(e.target.checked)} 
                        />
                        <label htmlFor="chk-split-files">Split file into parts</label>
                      </div>
                      <div className={`form-group split-size-group ${isSplit ? "" : "hidden"}`} id="split-size-group">
                        <label htmlFor="input-split-size">Contacts per part:</label>
                        <input 
                          type="number" 
                          id="input-split-size" 
                          min="10" 
                          max="10000" 
                          value={splitSize} 
                          onChange={e => setSplitSize(Math.max(10, parseInt(e.target.value) || 99))} 
                        />
                      </div>
                    </div>

                    {/* Dynamic Split Rows Container */}
                    {isSplit && (() => {
                      const target = combinedFile || extractionResults[0];
                      const totalContacts = target.count || totalExtractedContacts;
                      const totalParts = Math.ceil(totalContacts / splitSize);
                      const parts = Array.from({ length: totalParts }, (_, i) => {
                        const start = i * splitSize + 1;
                        const end = Math.min((i + 1) * splitSize, totalContacts);
                        return { index: i, start, end };
                      });

                      return (
                        <>
                          <div className="split-parts-container" id="split-parts-container">
                            {parts.map((part) => (
                              <div key={part.index} className="download-row">
                                <div className="download-row-info">
                                  <span className="download-row-name">Part {part.index + 1} ({part.start} - {part.end})</span>
                                  <span className="download-row-count">{part.end - part.start + 1} contacts</span>
                                </div>
                                <div className="download-row-buttons">
                                  <a
                                    href="#"
                                    className="btn btn-download-action btn-sm"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      triggerDownload(target.fileId, activeFormat, `${target.groupName} Part ${part.index + 1}`, part.index, splitSize);
                                    }}
                                  >
                                    <span>⬇ .{activeFormat.toUpperCase()}</span>
                                  </a>
                                  <button 
                                    onClick={() => sendToDM(target.fileId, target.groupName, part.index, splitSize)} 
                                    disabled={isSendingDm || isSendingAll}
                                    className="btn btn-send-dm btn-sm"
                                    type="button"
                                  >
                                    <span>💬 Send to DM</span>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="split-batch-actions-row" id="split-batch-actions-row">
                            <button 
                              className="btn btn-download-action" 
                              type="button" 
                              disabled={isDownloadingAll}
                              onClick={() => downloadAllChunks(target.fileId, target.groupName, totalContacts)}
                            >
                              <span>{isDownloadingAll ? "Downloading..." : "⬇ Download All Parts"}</span>
                            </button>
                            <button 
                              className="btn btn-send-dm" 
                              type="button" 
                              disabled={isSendingDm || isSendingAll}
                              onClick={() => sendAllChunksSequentially(target.fileId, target.groupName, totalContacts)}
                            >
                              <span>{isSendingAll ? "Sending Chunks..." : "💬 Send All to DM"}</span>
                            </button>
                          </div>
                        </>
                      );
                    })()}
                  </>
                )}
                
                {/* Per-group download rows (multi-group extraction) */}
                {extractionResults && extractionResults.length > 1 && (
                  <div className="download-rows-container" id="download-rows-container">
                    {extractionResults.map((res, i) => (
                      <div key={i} className="download-row">
                        <div className="download-row-info">
                          <span className="download-row-name">{res.groupName}</span>
                          <span className="download-row-count">{res.count} contacts</span>
                        </div>
                        <div className="download-row-buttons">
                          <a
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              triggerDownload(res.fileId, activeFormat, res.groupName);
                            }}
                            className="btn btn-download-action btn-sm"
                          >
                            <span>⬇ .{activeFormat.toUpperCase()}</span>
                          </a>
                          <button
                            onClick={() => sendToDM(res.fileId, res.groupName)}
                            className="btn btn-send-dm btn-sm"
                            type="button"
                          >
                            <span>💬 Send to DM</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Extraction History Panel */}
              <div className="history-panel" id="history-panel">
                <div className="history-header" id="history-header" onClick={() => setIsHistoryOpen(!isHistoryOpen)}>
                  <span>📋 Recent Extractions {profile?.number ? `(+${profile.number})` : ''}</span>
                  <span className="history-chevron" id="history-chevron">{isHistoryOpen ? "▲" : "▼"}</span>
                </div>
                <div className={`history-content ${isHistoryOpen ? "expanded" : "collapsed"}`} id="history-content">
                  
                  {!profile?.number ? (
                    <div style={{ padding: '16px', background: 'rgba(0,0,0,0.2)' }}>
                      <h4 style={{ margin: '0', fontSize: '14px', textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>📱 Connect WhatsApp to view your history</h4>
                    </div>
                  ) : (
                    <div className="history-list" id="history-list">
                      {history.length === 0 ? (
                        <div className="history-empty">No previous extractions found.</div>
                      ) : (
                        history.map((item, i) => (
                          <div key={i} className="history-item" style={{ display: 'flex', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                            <div className="history-item-details" style={{ display: 'flex', flexDirection: 'column' }}>
                              <div className="history-item-name" style={{ fontSize: '12px', fontWeight: '500' }}>{item.groupName}</div>
                              <div className="history-item-meta" style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}>{item.count} contacts • {item.date}</div>
                            </div>
                            <div className="history-item-actions" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <select 
                                style={{ background: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '4px', padding: '2px 4px', fontSize: '10px' }}
                                value={historyFormats[item.fileId] || "csv"}
                                onChange={(e) => setHistoryFormats({...historyFormats, [item.fileId]: e.target.value})}
                              >
                                <option value="txt">.txt</option>
                                <option value="csv">.csv</option>
                                <option value="xlsx">.xlsx</option>
                                <option value="vcf">.vcf</option>
                              </select>
                              <a href="#" className="btn-history-dl" title="Download" onClick={(e) => { e.preventDefault(); triggerDownload(item.fileId, historyFormats[item.fileId] || "csv", item.groupName); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#818cf8', background: 'rgba(129,140,248,0.1)', padding: '6px', borderRadius: '6px', textDecoration: 'none', transition: 'all 0.2s' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              </a>
                              <button title="Send to DM" onClick={(e) => { e.preventDefault(); sendToDM(item.fileId, item.groupName); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(37,211,102,0.2)', color: '#25d366', padding: '6px', borderRadius: '6px', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                              </button>
                              <button title="Delete" onClick={(e) => { e.preventDefault(); deleteHistoryItem(item.id, item.groupName); }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(239,68,68,0.2)', color: '#ef4444', padding: '6px', borderRadius: '6px', border: 'none', cursor: 'pointer', transition: 'all 0.2s' }}>
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <footer className="app-footer">
          <p>WhatsApp Contact Extractor &bull; Powered by Node.js &amp; whatsapp-web.js</p>
        </footer>
      </div>

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="overlay" style={{ zIndex: 1050 }}>
          <div className="upgrade-modal-card">
            <div className="upgrade-header">
              <div className="upgrade-header-text">
                <h3>Upgrade Your Plan</h3>
                <p>You&apos;ve reached the limits of your current plan. Upgrade to unlock more power!</p>
              </div>
              <button onClick={() => setShowUpgradeModal(false)} className="btn-close-modal">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="upgrade-grid">
              {/* Pro Tier */}
              <div className="tier-card">
                <div>
                  <h4 className="tier-name">Pro</h4>
                  <p className="tier-price">₦2,500 <span>/mo</span></p>
                  <ul className="tier-features">
                    <li>10 Extractions / day</li>
                    <li>Max 50% (1/2) Contacts</li>
                    <li>Priority Support</li>
                  </ul>
                </div>
                <button 
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/stripe/checkout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phoneNumber: profile?.number, tier: 'pro' })
                      });
                      const data = await res.json();
                      if (data.url) {
                        window.location.href = data.url;
                      } else if (data.success) {
                        if (data.requires_action_url) {
                          window.location.href = data.requires_action_url;
                        } else {
                          addToast('Successfully upgraded to Pro!', 'success');
                          setShowUpgradeModal(false);
                          setUserTier('pro');
                        }
                      } else {
                        addToast(data.error || 'Failed to upgrade', 'error');
                      }
                    } catch (e) {
                      addToast('Checkout error', 'error');
                    }
                  }}
                  className={`btn-tier ${userTier === 'pro' || userTier === 'unlimited' ? 'disabled' : ''}`}
                  disabled={userTier === 'pro' || userTier === 'unlimited'}
                  style={{ opacity: userTier === 'pro' || userTier === 'unlimited' ? 0.5 : 1, cursor: userTier === 'pro' || userTier === 'unlimited' ? 'not-allowed' : 'pointer' }}
                >
                  {userTier === 'pro' ? 'Current Plan' : (userTier === 'unlimited' ? 'Included in Unlimited' : 'Select Pro')}
                </button>
              </div>

              {/* Unlimited Tier */}
              <div className="tier-card premium-tier">
                <div className="tier-badge-top">BEST VALUE</div>
                <div>
                  <h4 className="tier-name">Unlimited</h4>
                  <p className="tier-price">₦4,000 <span>/mo</span></p>
                  <ul className="tier-features">
                    <li>Unlimited Extractions</li>
                    <li>Unlimited Contacts</li>
                    <li>Priority Support</li>
                  </ul>
                </div>
                <button 
                  onClick={async () => {
                    try {
                      const res = await fetch('/api/stripe/checkout', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ phoneNumber: profile?.number, tier: 'unlimited' })
                      });
                      const data = await res.json();
                      if (data.url) {
                        window.location.href = data.url;
                      } else if (data.success) {
                        if (data.requires_action_url) {
                          window.location.href = data.requires_action_url;
                        } else {
                          addToast('Successfully upgraded to Unlimited!', 'success');
                          setShowUpgradeModal(false);
                          setUserTier('unlimited');
                        }
                      } else {
                        addToast(data.error || 'Failed to upgrade', 'error');
                      }
                    } catch (e) {
                      addToast('Checkout error', 'error');
                    }
                  }}
                  className={`btn-tier premium ${userTier === 'unlimited' ? 'disabled' : ''}`}
                  disabled={userTier === 'unlimited'}
                  style={{ opacity: userTier === 'unlimited' ? 0.5 : 1, cursor: userTier === 'unlimited' ? 'not-allowed' : 'pointer' }}
                >
                  {userTier === 'unlimited' ? 'Current Plan' : (userTier === 'pro' ? 'Upgrade to Unlimited' : 'Select Unlimited')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Session busy overlay */}
      {clientState === "extracting" && (
        <div id="busy-overlay" className="overlay">
          <div className="overlay-card">
            <span className="overlay-icon">⚠️</span>
            <h2>Client Instance Busy</h2>
            <p>
              Another user or session is currently connecting or running an extraction. The WhatsApp extraction server is instance-specific to prevent socket conflicts.
            </p>
            <div className="loader-line"></div>
            <p className="overlay-footer">Please check back in a few moments.</p>
          </div>
        </div>
      )}
      {/* Confirm Dialog Modal */}
      {confirmDialog && (
        <div className="overlay" style={{ zIndex: 1050 }}>
          <div className="upgrade-modal-card" style={{ maxWidth: '450px' }}>
            <div className="upgrade-header" style={{ borderBottom: 'none', paddingBottom: '0' }}>
              <div className="upgrade-header-text">
                <h3>{confirmDialog.title || 'Are you sure?'}</h3>
                <p style={{ marginTop: '8px', color: 'var(--text-secondary)' }}>{confirmDialog.message}</p>
              </div>
              <button onClick={() => setConfirmDialog(null)} className="btn-close-modal">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div style={{ display: 'flex', gap: '12px', marginTop: '32px' }}>
              <button 
                onClick={() => setConfirmDialog(null)}
                style={{ flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', color: 'white', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s' }}
                onMouseEnter={e => e.target.style.background = 'rgba(255,255,255,0.1)'}
                onMouseLeave={e => e.target.style.background = 'rgba(255,255,255,0.05)'}
              >
                Cancel
              </button>
              <button 
                onClick={confirmDialog.onConfirm}
                disabled={isLoggingOut}
                style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.8), rgba(220, 38, 38, 0.9))', border: 'none', borderRadius: '12px', color: 'white', cursor: isLoggingOut ? 'not-allowed' : 'pointer', fontWeight: 'bold', transition: 'all 0.2s', boxShadow: '0 4px 15px rgba(239, 68, 68, 0.3)', opacity: isLoggingOut ? 0.7 : 1 }}
                onMouseEnter={e => { if(!isLoggingOut) e.target.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { if(!isLoggingOut) e.target.style.transform = 'translateY(0)'; }}
              >
                {isLoggingOut ? "Logging out..." : (confirmDialog.confirmText || 'Confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            {toast.type === 'error' && <span style={{ marginRight: '8px' }}>❌</span>}
            {toast.type === 'success' && <span style={{ marginRight: '8px' }}>✅</span>}
            {toast.message}
          </div>
        ))}
      </div>
    </div>
  );
}
