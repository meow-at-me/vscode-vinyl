// @ts-check
(function () {
  const vscode = acquireVsCodeApi();

  const $ = (id) => document.getElementById(id);
  const record = $("record");
  const tonearm = $("tonearm");
  const labelArt = $("label-art");
  const titleEl = $("title");
  const titleSpan = titleEl.querySelector("span");
  const artistEl = $("artist");
  const progressFill = $("progress-fill");
  const playPauseBtn = $("playpause");
  const noticeEl = $("notice");
  const connectBtn = $("connect");
  const playlistsBtn = $("playlists-btn");
  const playlistsEl = $("playlists");

  let playlistsVisible = false;

  // ---- send commands ----
  $("prev").addEventListener("click", () => vscode.postMessage({ cmd: "prev" }));
  $("next").addEventListener("click", () => vscode.postMessage({ cmd: "next" }));
  playPauseBtn.addEventListener("click", () => vscode.postMessage({ cmd: "playPause" }));
  connectBtn.addEventListener("click", () => {
    if (connectBtn.dataset.mode === "logout") {
      vscode.postMessage({ cmd: "logout" });
    } else {
      vscode.postMessage({ cmd: "login" });
    }
  });
  playlistsBtn.addEventListener("click", () => {
    playlistsVisible = !playlistsVisible;
    playlistsEl.classList.toggle("hidden", !playlistsVisible);
    if (playlistsVisible) {
      vscode.postMessage({ cmd: "requestPlaylists" });
    }
  });

  // ---- receive state ----
  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.type) {
      case "state":
        renderState(msg.state);
        break;
      case "playlists":
        renderPlaylists(msg.items);
        break;
      case "config":
        document.body.dataset.skin = msg.lpSkin;
        break;
      case "error":
        if (msg.message) noticeEl.textContent = msg.message;
        break;
    }
  });

  function setSpinning(on) {
    record.classList.toggle("paused", !on);
    tonearm.classList.toggle("on", on);
    playPauseBtn.textContent = on ? "⏸" : "▶";
  }

  function renderState(s) {
    // connection UI
    if (!s.loggedIn) {
      connectBtn.textContent = "Connect Spotify";
      connectBtn.dataset.mode = "login";
      connectBtn.classList.remove("hidden");
      playlistsBtn.classList.add("hidden");
    } else {
      connectBtn.textContent = "Disconnect";
      connectBtn.dataset.mode = "logout";
      connectBtn.classList.remove("hidden");
      playlistsBtn.classList.remove("hidden");
    }

    setSpinning(!!s.isPlaying);

    if (s.hasTrack) {
      setText(titleSpan, s.track || "");
      artistEl.textContent = s.artist || "";
      // marquee only when text overflows
      requestAnimationFrame(() => {
        titleEl.classList.toggle("scroll", titleSpan.scrollWidth > titleEl.clientWidth);
      });
      if (s.albumArt) {
        labelArt.style.backgroundImage = `url("${s.albumArt}")`;
      }
      if (s.durationMs) {
        const pct = Math.min(100, ((s.progressMs || 0) / s.durationMs) * 100);
        progressFill.style.width = pct + "%";
      }
    } else {
      setText(titleSpan, s.loggedIn ? "Nothing playing" : "Not connected");
      artistEl.textContent = "";
      titleEl.classList.remove("scroll");
      progressFill.style.width = "0%";
      labelArt.style.backgroundImage = "";
    }

    noticeEl.textContent = s.notice || (s.deviceName && s.isPlaying ? "▶ " + s.deviceName : "");
  }

  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  function renderPlaylists(items) {
    playlistsEl.innerHTML = "";
    if (!items || !items.length) {
      const empty = document.createElement("div");
      empty.className = "pl-item";
      empty.textContent = "No playlists found.";
      playlistsEl.appendChild(empty);
      return;
    }
    for (const p of items) {
      const row = document.createElement("div");
      row.className = "pl-item";

      if (p.imageUrl) {
        const img = document.createElement("img");
        img.src = p.imageUrl;
        img.alt = "";
        row.appendChild(img);
      }
      const name = document.createElement("span");
      name.className = "pl-name";
      name.textContent = p.name;
      row.appendChild(name);

      const count = document.createElement("span");
      count.className = "pl-count";
      count.textContent = p.trackCount + "";
      row.appendChild(count);

      row.addEventListener("click", () => {
        vscode.postMessage({ cmd: "playContext", uri: p.uri });
        playlistsVisible = false;
        playlistsEl.classList.add("hidden");
      });
      playlistsEl.appendChild(row);
    }
  }

  // tell host we're ready
  vscode.postMessage({ cmd: "ready" });
})();
