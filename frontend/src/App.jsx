
import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_URL = "http://localhost:5000/api/auth";
const FILE_API_URL = "http://localhost:5000/api/files";

function App() {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  const [files, setFiles] = useState([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState("");

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const [theme, setTheme] = useState(
    () => localStorage.getItem("secureshare-theme") || "dark"
  );

  // Apply and save the selected theme.
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("secureshare-theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => current === "dark" ? "light" : "dark");
  }

  // Load files belonging to the current user.
  async function loadFiles() {
    const token = sessionStorage.getItem("token");

    if (!token) {
      setFiles([]);
      return;
    }

    setFilesLoading(true);
    setFilesError("");

    try {
      const response = await fetch(FILE_API_URL, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Could not load files.");
      }

      setFiles(data.files || []);
    } catch (error) {
      setFilesError(error.message || "Could not load files.");
    } finally {
      setFilesLoading(false);
    }
  }

  // Validate an existing login session.
  useEffect(() => {
    async function checkSession() {
      const token = sessionStorage.getItem("token");

      if (!token) {
        setCheckingSession(false);
        return;
      }

      try {
        const response = await fetch(`${API_URL}/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          sessionStorage.removeItem("token");
          setUser(null);
          return;
        }

        const data = await response.json();
        setUser(data.user);
        await loadFiles();
      } catch {
        setMessage("Cannot reach the server. Please try again.");
      } finally {
        setCheckingSession(false);
      }
    }

    checkSession();
  }, []);

  // Calculate statistics from real file metadata.
  const totalStorage = useMemo(
    () => files.reduce((total, file) => total + (file.size || 0), 0),
    [files]
  );

  const fileTypes = useMemo(
    () => new Set(
      files.map((file) => {
        const parts = file.originalName.split(".");
        return parts.length > 1
          ? parts.pop().toLowerCase()
          : "other";
      })
    ).size,
    [files]
  );

  const recentUploads = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

    return files.filter(
      (file) => file.createdAt && new Date(file.createdAt).getTime() >= cutoff
    ).length;
  }, [files]);

  const filteredFiles = useMemo(() => {
    return files.filter((file) => {
      const matchesSearch = file.originalName
        .toLowerCase()
        .includes(search.toLowerCase());

      const extension = file.originalName.includes(".")
        ? file.originalName.split(".").pop().toLowerCase()
        : "other";

      const matchesFilter =
        filter === "all" ||
        (filter === "images" && ["png", "jpg", "jpeg"].includes(extension)) ||
        (filter === "documents" && ["pdf", "docx", "txt"].includes(extension));

      return matchesSearch && matchesFilter;
    });
  }, [files, search, filter]);

  // Format bytes into readable sizes.
  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  // Registration and login.
  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const endpoint = isLogin ? "/login" : "/register";

      const response = await fetch(`${API_URL}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isLogin ? { email, password } : { name, email, password }
        ),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Something went wrong.");
      }

      if (isLogin) {
        sessionStorage.setItem("token", data.token);
        setUser(data.user);
        setMessage("");
        await loadFiles();
      } else {
        setIsLogin(true);
        setPassword("");
        setMessage("Account created! You can now log in.");
      }
    } catch (error) {
      setMessage(
        error instanceof TypeError
          ? "Cannot connect to the server. Check that your backend is running."
          : error.message
      );
    } finally {
      setLoading(false);
    }
  }

  // Upload a file.
  async function handleUpload(event) {
    event.preventDefault();
    setUploadMessage("");

    if (!selectedFile) {
      setUploadMessage("Please select a file first.");
      return;
    }

    const token = sessionStorage.getItem("token");

    if (!token) {
      setUser(null);
      setUploadMessage("Your session expired. Please log in again.");
      return;
    }

    if (selectedFile.size > 5 * 1024 * 1024) {
      setUploadMessage("File exceeds the 5 MB size limit.");
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    setUploading(true);

    try {
      const response = await fetch(`${FILE_API_URL}/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "File upload failed.");
      }

      setUploadMessage(`Success! ${data.file.originalName} uploaded.`);
      setSelectedFile(null);
      event.target.reset();
      await loadFiles();
    } catch (error) {
      setUploadMessage(
        error instanceof TypeError
          ? "Cannot connect to the server. Check your backend."
          : error.message
      );
    } finally {
      setUploading(false);
    }
  }

  // Download a file securely.
  async function handleDownload(file) {
    try {
      const token = sessionStorage.getItem("token");

      if (!token) throw new Error("Please log in again.");

      const response = await fetch(
        `${FILE_API_URL}/${file._id}/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!response.ok) {
        let errorMessage = `Download failed (${response.status}).`;

        try {
          const data = await response.json();
          errorMessage = data.message || errorMessage;
        } catch {
          // Use the default message.
        }

        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = file.originalName;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (error) {
      alert(error.message || "Could not download the file.");
    }
  }

  function logout() {
    sessionStorage.removeItem("token");
    setUser(null);
    setFiles([]);
    setPassword("");
    setSelectedFile(null);
    setUploadMessage("");
    setFilesError("");
    setMessage("You have been logged out.");
  }

  if (checkingSession) {
    return <div className="page">Checking your session...</div>;
  }

  // Login and registration screen.
  if (!user) {
    return (
      <div className="page">
        <div className="auth-card">
          <div className="dashboard-header">
            <h1>SecureShare</h1>
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>

          <p className="subtitle">
            Share files securely and privately.
          </p>

          <div className="tabs">
            <button
              type="button"
              className={isLogin ? "active" : ""}
              onClick={() => {
                setIsLogin(true);
                setMessage("");
              }}
            >
              Login
            </button>
            <button
              type="button"
              className={!isLogin ? "active" : ""}
              onClick={() => {
                setIsLogin(false);
                setMessage("");
              }}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            {!isLogin && (
              <label>
                Full Name
                <input
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Enter your name"
                  required
                />
              </label>
            )}

            <label>
              Email Address
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
                required
              />
            </label>

            <label>
              Password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                required
              />
            </label>

            <button className="submit-btn" type="submit" disabled={loading}>
              {loading
                ? "Please wait..."
                : isLogin
                  ? "Login to SecureShare"
                  : "Create Account"}
            </button>
          </form>

          {message && <p role="status">{message}</p>}
          <p className="footer-text">Your files. Your privacy.</p>
        </div>
      </div>
    );
  }

  // Premium dashboard.
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <a className="brand" href="#overview">
          <span className="brand-icon">◆</span>
          <span>SecureShare</span>
        </a>

        <p className="sidebar-label">WORKSPACE</p>

        <nav className="sidebar-nav">
          <a className="nav-item active" href="#overview">▦ <span>Overview</span></a>
          <a className="nav-item" href="#my-files">▤ <span>My Files</span></a>
          <a className="nav-item" href="#upload">↑ <span>Upload Files</span></a>
        </nav>

        <div className="sidebar-bottom">
          <div className="user-mini">
            <div className="avatar">
              {(user.name || user.email || "U").charAt(0).toUpperCase()}
            </div>
            <div className="user-mini-info">
              <strong>{user.name}</strong>
              <small>{user.email}</small>
            </div>
          </div>

          <button className="sidebar-logout" onClick={logout}>
            ↪ Log out
          </button>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <p className="breadcrumb">Workspace / Overview</p>
            <h1>Dashboard</h1>
          </div>

          <div className="topbar-actions">
            <button className="theme-toggle" onClick={toggleTheme}>
              {theme === "dark" ? "☀️ Light mode" : "🌙 Dark mode"}
            </button>
            <div className="secure-badge">● Secure session</div>
          </div>
        </header>

        <section className="dashboard-welcome" id="overview">
          <div>
            <p className="eyebrow">YOUR PERSONAL WORKSPACE</p>
            <h2>Welcome back, {user.name} 👋</h2>
            <p>Your files, organized in one secure place.</p>
          </div>
          <a className="primary-link" href="#upload">+ Upload a file</a>
        </section>

        <section className="stats-grid" aria-label="File statistics">
          <article className="stat-card">
            <div className="stat-top">
              <span>Total files</span><span className="stat-icon purple">▤</span>
            </div>
            <strong>{files.length}</strong>
            <small>Files in your workspace</small>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>Storage used</span><span className="stat-icon blue">◫</span>
            </div>
            <strong>{formatSize(totalStorage)}</strong>
            <small>Across your uploaded files</small>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>Recent uploads</span><span className="stat-icon green">↗</span>
            </div>
            <strong>{recentUploads}</strong>
            <small>Uploaded in the last 7 days</small>
          </article>

          <article className="stat-card">
            <div className="stat-top">
              <span>File types</span><span className="stat-icon orange">▦</span>
            </div>
            <strong>{fileTypes}</strong>
            <small>Distinct extensions</small>
          </article>
        </section>

        <section className="content-panel" id="upload">
          <div className="section-heading">
            <div>
              <h2>Upload a file</h2>
              <p>PDF, PNG, JPG, TXT, or DOCX · Maximum 5 MB</p>
            </div>
          </div>

          <form className="upload-form" onSubmit={handleUpload}>
            <label className="file-picker">
              <span className="upload-symbol">↑</span>
              <span>
                <strong>
                  {selectedFile ? selectedFile.name : "Choose a file to upload"}
                </strong>
                <small>
                  {selectedFile
                    ? formatSize(selectedFile.size)
                    : "Select a document or image from your device"}
                </small>
              </span>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt,.docx"
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] || null);
                  setUploadMessage("");
                }}
                required
              />
            </label>

            <button className="submit-btn" type="submit"
              disabled={uploading || !selectedFile}>
              {uploading ? "Uploading..." : "Upload file"}
            </button>
          </form>

          {uploadMessage && (
            <p role="status" className="feedback-message">{uploadMessage}</p>
          )}
        </section>

        <section className="content-panel" id="my-files">
          <div className="section-heading">
            <div>
              <h2>Your files</h2>
              <p>Manage and download your uploaded documents.</p>
            </div>

            <button className="secondary-button" onClick={loadFiles}
              disabled={filesLoading}>
              {filesLoading ? "Refreshing..." : "↻ Refresh"}
            </button>
          </div>

          <div className="file-toolbar">
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search your files..."
              aria-label="Search files"
            />

            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Filter files"
            >
              <option value="all">All files</option>
              <option value="documents">Documents</option>
              <option value="images">Images</option>
            </select>
          </div>

          {filesError && <p role="alert">{filesError}</p>}

          {filesLoading && files.length === 0 && <p>Loading files...</p>}

          {!filesLoading && !filesError && files.length === 0 && (
            <div className="empty-state">
              <span>▤</span>
              <h3>No files yet</h3>
              <p>Upload your first file to see it here.</p>
            </div>
          )}

          {!filesLoading && files.length > 0 && filteredFiles.length === 0 && (
            <p>No files match your search or filter.</p>
          )}

          {filteredFiles.map((file) => (
            <div className="file-row" key={file._id}>
              <div className="file-info">
                <span className="file-icon">▤</span>
                <div>
                  <p><strong>{file.originalName}</strong></p>
                  <small>
                    {formatSize(file.size)}
                    {" · "}
                    {file.createdAt
                      ? new Date(file.createdAt).toLocaleDateString()
                      : "Date unavailable"}
                  </small>
                </div>
              </div>

              <button className="download-button"
                onClick={() => handleDownload(file)}>
                ↓ Download
              </button>
            </div>
          ))}
        </section>

        <footer className="dashboard-footer">
          <span>SecureShare · Private file management</span>
          <span>Protected by authentication</span>
        </footer>
      </main>
    </div>
  );
}

export default App;
