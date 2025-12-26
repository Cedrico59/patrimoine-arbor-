(() => {
  "use strict";

  // =========================
  // CONFIG
  // =========================
  const API_URL = "https://script.google.com/macros/s/AKfycbxW_WIAZ4cBnk0ND3-0PoYcce5C52eAE-Sc-RtfWq6ceXqbWgwlekIHUfws3dXxzpGm/exec";
  const STORAGE_KEY = "marcq_arbres_v1";
  const MARCQ_CENTER = [50.676, 3.086];

  // Quartiers (coloring)
  const QUARTIER_COLORS = {
    "Hautes loges-Briqueterie": "#ff6b6b",
    "Bourg": "#4dabf7",
    "Buisson-Delcencerie": "#51cf66",
    "Mairie-Quesne": "#fcc419",
    "Pont-Plouich-CLémenceau": "#9775fa",
    "Cimetière Delcencerie": "#97733a",
    "Cimetière Pont": "#ff922b",
  };

  // =========================
  // GLOBAL STATE
  // =========================
  let map;
  let quartiersLayer = null;
  let cityLayer = null;

  let trees = [];
  let selectedId = null;
  let lastDeletedTree = null;


  const markers = new Map(); // id -> marker

  // =========================
  // DOM HELPERS
  // =========================
  const el = (id) => document.getElementById(id);

  const treeListEl = () => el("treeList");
  const countEl = () => el("count");
  const qEl = () => el("q");
  const treeIdEl = () => el("treeId");
  const editorTitle = () => el("editorTitle");
  const editorHint = () => el("editorHint");
  const latEl = () => el("lat");
  const lngEl = () => el("lng");
  const speciesEl = () => el("species");
  const heightEl = () => el("height");
  const dbhEl = () => el("dbh");
  const secteurEl = () => el("secteur");
  const addressEl = () => el("address");
  const tagsEl = () => el("tags");
  const commentEl = () => el("comment");
  const photosEl = () => el("photos");
  const galleryEl = () => el("gallery");

  const saveBtn = () => el("saveBtn");
  const newBtn = () => el("newBtn");
  const deleteBtn = () => el("deleteBtn");
  const exportBtn = () => el("exportBtn");
  const importBtn = () => el("importBtn");
  const importFile = () => el("importFile");

  // =========================
  // UTIL
  // =========================
  function uid() {
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function fmtCoord(x) {
    if (typeof x !== "number") return "";
    return x.toFixed(6);
  }

  function normalizeTags(s) {
    return (s || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
  }

  function escapeHtml(str) {
    return (str ?? "")
      .toString()
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function getTreeById(id) {
    return trees.find((t) => t.id === id);
  }

  function loadTrees() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveTreesLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trees));
  }

  function persistAndRefresh(focusId = selectedId) {
    saveTreesLocal();
    renderMarkers();
    renderList();
    renderSecteurCount();
    if (focusId) setSelected(focusId);
  }

  // =========================
  // GOOGLE SHEETS SYNC
  // =========================
  async function syncToSheets(treeObj) {
    try {
      const params = new URLSearchParams();
      for (const key in treeObj) {
        const value = Array.isArray(treeObj[key]) ? treeObj[key].join(",") : treeObj[key];
        if (key === "photos") {
  params.append("photos", JSON.stringify(t.photos || []));
} else {
  params.append(key, value ?? "");
}

      }
      await fetch(API_URL, { method: "POST", body: params });
    } catch (e) {
      console.warn("Sync Google Sheets échouée", e);
    }
  }

  async function deleteFromSheets(id) {
    try {
      const params = new URLSearchParams();
      params.append("action", "delete");
      params.append("id", id);
      await fetch(API_URL, { method: "POST", body: params });
    } catch (e) {
      console.warn("Suppression Google Sheets échouée", e);
    }
  }

  // =========================
  // ICONS / COLORS
  // =========================
  function createTreeIcon(color = "#4CAF50") {
    const gradientId = "g_" + Math.random().toString(36).slice(2);

    return L.divIcon({
      className: "tree-marker",
      html: `
        <svg width="42" height="42" viewBox="0 0 64 64">
          <defs>
            <radialGradient id="${gradientId}" cx="50%" cy="40%" r="50%">
              <stop offset="0%" stop-color="#7CFC90"/>
              <stop offset="100%" stop-color="${color}"/>
            </radialGradient>
          </defs>
          <circle cx="32" cy="26" r="20" fill="url(#${gradientId})"/>
          <circle cx="22" cy="30" r="14" fill="url(#${gradientId})" opacity="0.9"/>
          <circle cx="42" cy="30" r="14" fill="url(#${gradientId})" opacity="0.9"/>
          <rect x="28" y="38" width="8" height="18" rx="2" fill="#6D4C41"/>
        </svg>
      `,
      iconSize: [42, 42],
      iconAnchor: [21, 40],
      popupAnchor: [0, -36],
    });
  }

  function getColorFromSecteur(secteur) {
    switch (secteur) {
      case "Hautes Loges - Briqueterie": return "#7CB342";
      case "Bourg": return "#1565C0";
      case "Buisson - Delcencerie": return "#cc5c01ff";
      case "Mairie - Quesne": return "#6A1B9A";
      case "Pont - Plouich - Clémenceau": return "#01a597ff";
      case "Cimetière Delcencerie": return "#083b19ff";
      case "Cimetière Pont": return "#C62828";
      case "Hippodrome": return "#F9A825";
      case "Ferme aux Oies": return "#AD1457";
      default: return "#607D8B";
    }
  }

  function getQuartierColor(name) {
    return QUARTIER_COLORS[name] || "#999999";
  }
const SECTEURS = [
  "Hautes Loges - Briqueterie",
  "Bourg",
  "Buisson - Delcencerie",
  "Mairie - Quesne",
  "Pont - Plouich - Clémenceau",
  "Cimetière Delcencerie",
  "Cimetière Pont",
  "Hippodrome",
  "Ferme aux Oies"
];
function addLegendToMap() {
  const legend = L.control({ position: "bottomright" });

  legend.onAdd = function () {
    const div = L.DomUtil.create("div", "map-legend");
    div.innerHTML = "<b>Légende — Secteurs</b><br>";

    SECTEURS.forEach((secteur) => {
      const color = getColorFromSecteur(secteur);

      div.innerHTML += `
        <div class="legend-item">
          <span class="legend-icon" style="background:${color}"></span>
          ${secteur}
        </div>
      `;
    });

    return div;
  };

  legend.addTo(map);
}

  // =========================
  // PREVIEW + NEW TAB
  // =========================
  function renderTreePreview(t) {
    const card = el("treePreview");
    if (!card) return;

    if (!t) {
      card.style.display = "none";
      return;
    }

    card.style.display = "block";

    el("p-id").textContent = t.id || "—";
    el("p-species").textContent = t.species || "—";
    el("p-secteur").textContent = t.secteur || "—";
    el("p-quartier").textContent = t.quartier || "—";
    el("p-height").textContent = t.height ?? "—";
    el("p-dbh").textContent = t.dbh ?? "—";
    el("p-address").textContent = t.address || "—";
    el("p-comment").textContent = t.comment || "";

    const img = el("previewPhoto");
    if (img) {
      if (t.photos && t.photos.length > 0) {
        img.src = t.photos[0].dataUrl;
        img.style.display = "block";
      } else {
        img.style.display = "none";
      }
    }
  }

  // IMPORTANT: pour que onclick="openTreeInNewTab()" marche depuis HTML
  window.openTreeInNewTab = function () {
    if (!selectedId) return;
    const t = getTreeById(selectedId);
    if (!t) return;

    const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Fiche arbre – ${escapeHtml(t.id)}</title>
<style>
body{font-family:system-ui,Arial,sans-serif;background:#0b1020;color:#eef1ff;padding:20px}
.card{max-width:700px;margin:auto;background:#111a33;border-radius:16px;padding:20px}
img{width:100%;max-height:500px;object-fit:contain;border-radius:12px;margin-bottom:16px}
small{color:#9db0ff}
</style>
</head>
<body>
<div class="card">
  ${t.photos?.length ? `<img src="${t.photos[0].dataUrl}">` : ""}
  <h1>Fiche de l’arbre</h1>
  <p><b>ID :</b> ${escapeHtml(t.id)}</p>
  <p><b>Espèce :</b> ${escapeHtml(t.species || "—")}</p>
  <p><b>Secteur :</b> ${escapeHtml(t.secteur || "—")}</p>
  <p><b>Quartier :</b> ${escapeHtml(t.quartier || "—")}</p>
  <p><b>Hauteur :</b> ${t.height ?? "—"} m</p>
  <p><b>Diamètre :</b> ${t.dbh ?? "—"} cm</p>
  <p><b>Adresse :</b> ${escapeHtml(t.address || "—")}</p>
  <p><b>Commentaire :</b></p>
  <small>${escapeHtml(t.comment || "—")}</small>
</div>
</body>
</html>`;

    const win = window.open();
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
  };

  // =========================
  // GALLERY
  // =========================
  function renderGallery(photos) {
    const g = galleryEl();
    if (!g) return;

    g.innerHTML = "";
    if (!photos || photos.length === 0) return;

    photos.forEach((p, idx) => {
      const wrap = document.createElement("div");
      wrap.className = "photo";

      const img = document.createElement("img");
      img.src = p.dataUrl;
      img.alt = p.name || `Photo ${idx + 1}`;

      const meta = document.createElement("div");
      meta.className = "meta";

      const span = document.createElement("span");
      const date = p.addedAt ? new Date(p.addedAt).toLocaleString("fr-FR") : "";
      span.textContent = `${p.name || "photo"}${date ? " • " + date : ""}`;

      const del = document.createElement("button");
      del.className = "danger";
      del.textContent = "Retirer";
      del.onclick = () => {
        if (!selectedId) return;
        const t = getTreeById(selectedId);
        if (!t) return;
        t.photos = (t.photos || []).filter((_, i) => i !== idx);
        t.updatedAt = Date.now();
        persistAndRefresh(t.id);
      };

      meta.appendChild(span);
      meta.appendChild(del);

      wrap.appendChild(img);
      wrap.appendChild(meta);
      g.appendChild(wrap);
    });
  }

  async function readFilesAsDataUrls(files) {
    const out = [];
    for (const f of files) {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(new Error("Lecture fichier impossible"));
        r.readAsDataURL(f);
      });
      out.push({
        name: f.name,
        type: f.type,
        size: f.size,
        addedAt: Date.now(),
        dataUrl,
      });
    }
    return out;
  }

  // =========================
  // LIST
  // =========================
 function treeMatchesQuery(t, q) {
  if (!q) return true;

  const s = q.toLowerCase();

  const hay = [
    t.id,                    // ✅ ID
    t.species,
    t.address,
    t.comment,
    (t.tags || []).join(" "),
    t.secteur,
    t.quartier,
    `${t.lat}`,
    `${t.lng}`,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return hay.includes(s);
}


  function highlightListSelection() {
    const list = treeListEl();
    if (!list) return;

    for (const node of list.querySelectorAll(".treeItem")) {
      node.style.outline = (node.dataset.id === selectedId)
        ? "2px solid rgba(106,166,255,.65)"
        : "none";
    }
  }

  function renderList() {
    const list = treeListEl();
    const count = countEl();
    const q = (qEl()?.value || "").trim();

    if (!list || !count) return;

    const filtered = trees.filter((t) => treeMatchesQuery(t, q));

    count.textContent = `${filtered.length} / ${trees.length}`;
    list.innerHTML = "";

    if (filtered.length === 0) {
      const empty = document.createElement("div");
      empty.className = "hint";
      empty.textContent = q
        ? "Aucun résultat."
        : "Aucun arbre enregistré. Clique sur la carte pour en ajouter un.";
      list.appendChild(empty);
      return;
    }

    for (const t of filtered) {
      const item = document.createElement("div");
      item.className = "treeItem";
      item.dataset.id = t.id;

      const left = document.createElement("div");
      const title = document.createElement("b");
      title.textContent = t.species || "Arbre (espèce inconnue)";

      const meta = document.createElement("small");
      meta.textContent =
        `${fmtCoord(t.lat)}, ${fmtCoord(t.lng)}` +
        (t.address ? " • " + t.address : "") +
        (t.secteur ? " • " + t.secteur : "");

      const tagsWrap = document.createElement("div");
      tagsWrap.style.marginTop = "6px";
      tagsWrap.style.display = "flex";
      tagsWrap.style.flexWrap = "wrap";
      tagsWrap.style.gap = "6px";

      (t.tags || []).slice(0, 4).forEach((tag) => {
        const p = document.createElement("span");
        p.className = "pill";
        p.textContent = tag;
        tagsWrap.appendChild(p);
      });

      left.appendChild(title);
      left.appendChild(meta);
      if ((t.tags || []).length) left.appendChild(tagsWrap);

      const right = document.createElement("div");
      right.className = "actions";

      const zoomBtn = document.createElement("button");
      zoomBtn.className = "secondary";
      zoomBtn.textContent = "Voir";
      zoomBtn.onclick = () => {
        map.setView([t.lat, t.lng], Math.max(map.getZoom(), 16));
        const m = markers.get(t.id);
        if (m) m.openPopup();
        setSelected(t.id);
        highlightListSelection();
      };

      right.appendChild(zoomBtn);

      item.onclick = (e) => {
        if (e.target && e.target.tagName && e.target.tagName.toLowerCase() === "button") return;
        setSelected(t.id);
        highlightListSelection();
      };

      item.appendChild(left);
      item.appendChild(right);
      list.appendChild(item);
    }

    highlightListSelection();
  }

  function renderSecteurCount() {
    const container = el("secteurCount");
    if (!container) return;

    const counts = {};
    for (const t of trees) {
      const s = t.secteur || "Non défini";
      counts[s] = (counts[s] || 0) + 1;
    }

    container.innerHTML = "";
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .forEach(([secteur, nb]) => {
        const div = document.createElement("div");
        div.className = "treeItem";
        div.innerHTML = `<b>${escapeHtml(secteur)}</b><span class="pill">${nb}</span>`;
        container.appendChild(div);
      });
  }

  // =========================
  // SELECT / FORM
  // =========================
  function clearForm(keepCoords = true) {
    speciesEl().value = "";
    heightEl().value = "";
    dbhEl().value = "";
    secteurEl().value = "";
    addressEl().value = "";
    tagsEl().value = "";
    commentEl().value = "";
    photosEl().value = "";

    if (!keepCoords) {
      latEl().value = "";
      lngEl().value = "";
    }
    renderGallery([]);
  }

  function setSelected(id) {
    selectedId = id;
    const t = id ? getTreeById(id) : null;

    if (!t) {
      editorTitle().textContent = "Ajouter un arbre";
      editorHint().textContent = "Clique sur la carte pour choisir l’emplacement, puis complète la fiche.";
      deleteBtn().disabled = true;
      treeIdEl().value = "";
      clearForm(false);
      renderTreePreview(null);
      return;
    }

    editorTitle().textContent = "Fiche arbre";
    editorHint().textContent = "Modifie les infos puis clique sur Enregistrer.";
    deleteBtn().disabled = false;

    treeIdEl().value = t.id || "";

    latEl().value = fmtCoord(t.lat);
    lngEl().value = fmtCoord(t.lng);
    speciesEl().value = t.species || "";
    heightEl().value = t.height ?? "";
    dbhEl().value = t.dbh ?? "";
    secteurEl().value = t.secteur || "";
    addressEl().value = t.address || "";
    tagsEl().value = (t.tags || []).join(", ");
    commentEl().value = t.comment || "";

    renderGallery(t.photos || []);
    renderTreePreview(t);
  }

  // =========================
  // MAP + LAYERS
  // =========================
  function addOrUpdateMarker(t) {
    const label = t.species ? t.species : "Arbre";
    const subtitle = t.address ? `— ${t.address}` : "";
    const tags = (t.tags || []).slice(0, 3).join(", ");

    const popupHtml =
      `<b>${escapeHtml(label)}</b> ${escapeHtml(subtitle)}<br/>` +
      `<small>Secteur : ${escapeHtml(t.secteur || "—")} • Quartier : ${escapeHtml(t.quartier || "—")}</small><br/>` +
      `<small>${escapeHtml(tags ? "Tags: " + tags : "Cliquer pour ouvrir la fiche")}</small>`;

    if (markers.has(t.id)) {
      const m = markers.get(t.id);
      m.setLatLng([t.lat, t.lng]);
      m.setIcon(createTreeIcon(getColorFromSecteur(t.secteur)));
      m.bindPopup(popupHtml);
      return;
    }

    const m = L.marker([t.lat, t.lng], {
      icon: createTreeIcon(getColorFromSecteur(t.secteur)),
    }).addTo(map);

    m.bindPopup(popupHtml);
    m.on("click", () => {
      setSelected(t.id);
      highlightListSelection();
    });

    markers.set(t.id, m);
  }

  function removeMarker(id) {
    const m = markers.get(id);
    if (m) {
      map.removeLayer(m);
      markers.delete(id);
    }
  }

  function renderMarkers() {
    for (const m of markers.values()) map.removeLayer(m);
    markers.clear();
    for (const t of trees) addOrUpdateMarker(t);
  }

  function getQuartierFromLatLng(lat, lng) {
    if (!quartiersLayer) return "Inconnu";
    if (typeof leafletPip === "undefined") return "Inconnu";

    const layers = leafletPip.pointInLayer([lng, lat], quartiersLayer);
    if (layers.length > 0) {
      return layers[0].feature?.properties?.name || "Inconnu";
    }
    return "Inconnu";
  }

  async function loadQuartiersGeoJSON() {
    try {
      const res = await fetch("quartiers-marcq.geojson");
      if (!res.ok) throw new Error("quartiers-marcq.geojson introuvable");
      const geojson = await res.json();

      quartiersLayer = L.geoJSON(geojson, {
        style: (feature) => {
          const nom = feature?.properties?.name || "Inconnu";
          return {
            color: getQuartierColor(nom),
            weight: 2,
            fillColor: getQuartierColor(nom),
            fillOpacity: 0.25,
          };
        },
        onEachFeature: (feature, layer) => {
          const nom = feature?.properties?.name || "Quartier";
          layer.bindPopup(`<b>${escapeHtml(nom)}</b>`);
        },
      }).addTo(map);
    } catch (err) {
      console.warn("Erreur chargement quartiers", err);
    }
  }

  async function loadCityContourAndLock() {
    try {
      const url = "https://geo.api.gouv.fr/communes/59378?format=geojson&geometry=contour";
      const res = await fetch(url);
      if (!res.ok) throw new Error("API geo.api.gouv.fr indisponible");
      const geojson = await res.json();

      cityLayer = L.geoJSON(geojson, {
        style: {
          color: "#00ffff",
          weight: 4,
          opacity: 1,
          fillColor: "#00ffff",
          fillOpacity: 0.15,
        },
      }).addTo(map);

      const bounds = cityLayer.getBounds();
      if (bounds && bounds.isValid && bounds.isValid()) {
        map.fitBounds(bounds);
        map.setMaxBounds(bounds);
        map.options.maxBoundsViscosity = 1.0;
      }
    } catch (err) {
      console.warn("Erreur chargement contour commune", err);
    }
  }

  // =========================
  // INIT
  // =========================
  function initMap() {
    map = L.map("map", {
      zoomControl: true,
      minZoom: 13,
      maxZoom: 18,
    }).setView(MARCQ_CENTER, 14);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap",
    }).addTo(map);

    // Click map => coords nouvelle fiche
    map.on("click", (e) => {
      // si contour chargé + pip dispo => imposer dans la commune
      if (cityLayer && typeof leafletPip !== "undefined") {
        const inside = leafletPip.pointInLayer([e.latlng.lng, e.latlng.lat], cityLayer).length > 0;
        if (!inside) {
          alert("⛔ L’arbre doit être situé dans Marcq-en-Barœul");
          return;
        }
      }

      const { lat, lng } = e.latlng;
      selectedId = null;

      deleteBtn().disabled = true;
      editorTitle().textContent = "Ajouter un arbre";
      editorHint().textContent = "Complète la fiche puis clique sur Enregistrer.";

      clearForm(false);
      latEl().value = fmtCoord(lat);
      lngEl().value = fmtCoord(lng);

      renderTreePreview(null);
      highlightListSelection();
    });
  }

  function wireUI() {
    qEl().addEventListener("input", () => renderList());

    exportBtn().onclick = () => {
      const blob = new Blob([JSON.stringify({ exportedAt: Date.now(), trees }, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "patrimoine-arbore-marcq-export.json";
      a.click();
      URL.revokeObjectURL(url);
    };
const toggleListBtn = el("toggleListBtn");
const treeListWrapper = el("treeListWrapper");

if (toggleListBtn && treeListWrapper) {
  let collapsed = false;

  toggleListBtn.onclick = () => {
    collapsed = !collapsed;

    treeListWrapper.style.display = collapsed ? "none" : "block";
    toggleListBtn.textContent = collapsed ? "Afficher" : "Réduire";
  };
}

    importBtn().onclick = () => importFile().click();

    importFile().onchange = async () => {
      const file = importFile().files?.[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const incoming = Array.isArray(data) ? data : data.trees;
        if (!Array.isArray(incoming)) throw new Error("Format JSON inattendu.");

        const byId = new Map(trees.map((t) => [t.id, t]));
        for (const t of incoming) {
          if (!t || !t.id) continue;
          byId.set(t.id, t);
        }
        trees = Array.from(byId.values());
        persistAndRefresh();
        alert("Import terminé.");
      } catch (e) {
        alert("Import impossible : " + (e?.message || e));
      } finally {
        importFile().value = "";
      }
    };

    newBtn().onclick = () => {
      selectedId = null;
      deleteBtn().disabled = true;
      editorTitle().textContent = "Ajouter un arbre";
      editorHint().textContent = "Clique sur la carte pour choisir l’emplacement, puis complète la fiche.";
      clearForm(true);
      renderList();
      highlightListSelection();
      renderTreePreview(null);
    };

    deleteBtn().onclick = async () => {
  if (!selectedId) return;
  if (!confirm("Supprimer cet arbre ?")) return;

  const t = getTreeById(selectedId);
  if (!t) return;

  // 🧠 sauvegarde pour annulation
  lastDeletedTree = { ...t };

  // 🔗 suppression Google Sheets
  await deleteFromSheets(t.id);

  // 🗑️ suppression locale
  trees = trees.filter(x => x.id !== t.id);
  removeMarker(t.id);
  selectedId = null;

  saveTreesLocal();
  renderMarkers();
  renderList();
  renderSecteurCount();
  setSelected(null);
  renderTreePreview(null);

  // 👀 afficher le bouton Annuler
  const undoBtn = el("undoBtn");
  if (undoBtn) undoBtn.style.display = "inline-block";
};
const undoBtn = el("undoBtn");
if (undoBtn) {
  undoBtn.onclick = async () => {
    if (!lastDeletedTree) return;

    const t = lastDeletedTree;
    lastDeletedTree = null;

    // 🔁 restauration locale
    trees.unshift(t);
    saveTreesLocal();
    renderMarkers();
    renderList();
    renderSecteurCount();
    setSelected(t.id);

    // 🔗 restauration Google Sheets
    await syncToSheets(t);

    // ❌ cacher le bouton
    undoBtn.style.display = "none";
  };
}


    saveBtn().onclick = async () => {
      const lat = parseFloat(latEl().value);
      const lng = parseFloat(lngEl().value);

      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        alert("Merci de définir un emplacement (clique sur la carte).");
        return;
      }

      const quartier = getQuartierFromLatLng(lat, lng);
      const photos =
        photosEl().files && photosEl().files.length
          ? await readFilesAsDataUrls(photosEl().files)
          : [];

      if (selectedId) {
        // update
        const t = getTreeById(selectedId);
        if (!t) return;

        t.lat = lat;
        t.lng = lng;
        t.quartier = quartier;
        t.species = speciesEl().value.trim();
        t.height = heightEl().value === "" ? null : Number(heightEl().value);
        t.dbh = dbhEl().value === "" ? null : Number(dbhEl().value);
        t.secteur = secteurEl().value;
        t.address = addressEl().value.trim();
        t.tags = normalizeTags(tagsEl().value);
        t.comment = commentEl().value.trim();
        t.updatedAt = Date.now();
        t.photos = [...(t.photos || []), ...photos];

        await syncToSheets(t);

        persistAndRefresh(t.id);
        photosEl().value = "";
        alert("Arbre mis à jour.");
        return;
      }

      // create
      const t = {
        id: uid(),
        lat,
        lng,
        quartier,
        species: speciesEl().value.trim(),
        height: heightEl().value === "" ? null : Number(heightEl().value),
        dbh: dbhEl().value === "" ? null : Number(dbhEl().value),
        secteur: secteurEl().value,
        address: addressEl().value.trim(),
        tags: normalizeTags(tagsEl().value),
        comment: commentEl().value.trim(),
        photos,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      await syncToSheets(t);

      trees.unshift(t);
      persistAndRefresh(t.id);

      treeIdEl().value = t.id;
      photosEl().value = "";
      alert("Arbre ajouté.");
    };
  }
async function loadTreesFromSheets() {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("Sheets indisponible");

    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Format Sheets invalide");

    trees = data;
    saveTreesLocal();

    console.log("📥 Données chargées depuis Google Sheets :", trees.length);
  } catch (e) {
    console.warn("⚠️ Impossible de charger depuis Sheets, fallback local", e);
    trees = loadTrees();
  }
}

  // =========================
  // START
  // =========================
  document.addEventListener("DOMContentLoaded", async () => {
    // si Leaflet pas chargé => stop clair
    if (typeof L === "undefined") {
      console.error("Leaflet (L) n'est pas chargé.");
      alert("Leaflet ne s'est pas chargé. Vérifie la connexion / scripts.");
      return;
    }

    // charge stockage
    await loadTreesFromSheets();


    // init
    initMap();
    addLegendToMap();
    wireUI();

    // layers
    await loadQuartiersGeoJSON();
    await loadCityContourAndLock();

    // render
    renderMarkers();
    renderList();
    renderSecteurCount();
    setSelected(null);

    console.log("✅ App chargée (A+B+C+D).");
  });
})();
