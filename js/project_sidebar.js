import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// View modes
const VIEW_MODES = {
  LIST: "list",
  ICON: "icon",
};

// File type icons mapping
const FILE_ICONS = {
  // Images
  ".png": "pi pi-image",
  ".jpg": "pi pi-image",
  ".jpeg": "pi pi-image",
  ".gif": "pi pi-image",
  ".webp": "pi pi-image",
  ".bmp": "pi pi-image",
  ".svg": "pi pi-image",
  // Videos
  ".mp4": "pi pi-video",
  ".webm": "pi pi-video",
  ".mov": "pi pi-video",
  ".avi": "pi pi-video",
  // Audio
  ".mp3": "pi pi-volume-up",
  ".wav": "pi pi-volume-up",
  ".ogg": "pi pi-volume-up",
  ".flac": "pi pi-volume-up",
  // Models/Data
  ".safetensors": "pi pi-box",
  ".ckpt": "pi pi-box",
  ".pt": "pi pi-box",
  ".pth": "pi pi-box",
  ".bin": "pi pi-box",
  // Text/Config
  ".json": "pi pi-file",
  ".yaml": "pi pi-file",
  ".yml": "pi pi-file",
  ".txt": "pi pi-file",
  ".md": "pi pi-file",
  // Default
  default: "pi pi-file",
};

// Image extensions that can show thumbnails
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];

// Get icon for file type
function getFileIcon(extension) {
  return FILE_ICONS[extension?.toLowerCase()] || FILE_ICONS.default;
}

// Check if file is an image that can show thumbnail
function isImageFile(extension) {
  return IMAGE_EXTENSIONS.includes(extension?.toLowerCase());
}

// Get thumbnail URL for an image in the input folder
// ComfyUI's /view endpoint requires separate filename and subfolder params
function getThumbnailUrl(path) {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash === -1) {
    // No subfolder, file is in root
    return `/view?filename=${encodeURIComponent(path)}&type=input&preview=webp`;
  }
  // Split into subfolder and filename
  const subfolder = path.substring(0, lastSlash);
  const filename = path.substring(lastSlash + 1);
  return `/view?filename=${encodeURIComponent(filename)}&type=input&subfolder=${encodeURIComponent(subfolder)}&preview=webp`;
}

// Format file size for display
function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

// State management
let currentViewMode = VIEW_MODES.LIST;
let currentPath = ""; // Current directory path for icon view navigation
let fileTreeData = null; // Cached tree data

// Get items at a specific path from the tree
function getItemsAtPath(tree, path) {
  if (!path || path === "") {
    return tree;
  }

  const parts = path.split("/");
  let current = tree;

  for (const part of parts) {
    const found = current.find(
      (item) => item.name === part && item.type === "directory"
    );
    if (found && found.children) {
      current = found.children;
    } else {
      return [];
    }
  }

  return current;
}

// Create a tree item element (LIST VIEW)
function createTreeItem(item, level = 0) {
  const container = document.createElement("div");
  container.className = "tree-item";
  container.style.paddingLeft = `${level * 16}px`;

  const row = document.createElement("div");
  row.className = "tree-row";
  row.dataset.path = item.path;
  row.dataset.type = item.type;

  if (item.type === "directory") {
    // Folder with expand/collapse
    const expandIcon = document.createElement("i");
    expandIcon.className = "pi pi-chevron-right expand-icon";
    row.appendChild(expandIcon);

    const folderIcon = document.createElement("i");
    folderIcon.className = "pi pi-folder folder-icon";
    row.appendChild(folderIcon);

    const name = document.createElement("span");
    name.className = "item-name";
    name.textContent = item.name;
    row.appendChild(name);

    // Children container (hidden by default)
    const childrenContainer = document.createElement("div");
    childrenContainer.className = "tree-children collapsed";

    if (item.children && item.children.length > 0) {
      item.children.forEach((child) => {
        childrenContainer.appendChild(createTreeItem(child, level + 1));
      });
    }

    // Click handler for expand/collapse
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      const isCollapsed = childrenContainer.classList.contains("collapsed");
      childrenContainer.classList.toggle("collapsed");
      expandIcon.className = isCollapsed
        ? "pi pi-chevron-down expand-icon"
        : "pi pi-chevron-right expand-icon";
      folderIcon.className = isCollapsed
        ? "pi pi-folder-open folder-icon"
        : "pi pi-folder folder-icon";
    });

    container.appendChild(row);
    container.appendChild(childrenContainer);
  } else {
    // File item
    const spacer = document.createElement("span");
    spacer.className = "expand-spacer";
    row.appendChild(spacer);

    const fileIcon = document.createElement("i");
    fileIcon.className = `${getFileIcon(item.extension)} file-icon`;
    row.appendChild(fileIcon);

    const name = document.createElement("span");
    name.className = "item-name";
    name.textContent = item.name;
    row.appendChild(name);

    if (item.size !== undefined) {
      const size = document.createElement("span");
      size.className = "item-size";
      size.textContent = formatFileSize(item.size);
      row.appendChild(size);
    }

    // Click handler for file selection
    row.addEventListener("click", (e) => {
      e.stopPropagation();
      // Remove previous selection
      document.querySelectorAll(".tree-row.selected").forEach((el) => {
        el.classList.remove("selected");
      });
      row.classList.add("selected");

      // Dispatch custom event for file selection
      const event = new CustomEvent("jomanodes:file-selected", {
        detail: { path: item.path, name: item.name, type: item.type },
      });
      document.dispatchEvent(event);
    });

    container.appendChild(row);
  }

  return container;
}

// Create an icon grid item (ICON VIEW)
function createIconItem(item, onNavigate) {
  const container = document.createElement("div");
  container.className = "icon-item";
  container.dataset.path = item.path;
  container.dataset.type = item.type;

  const preview = document.createElement("div");
  preview.className = "icon-preview";

  if (item.type === "directory") {
    // Folder icon
    const folderIcon = document.createElement("i");
    folderIcon.className = "pi pi-folder";
    preview.appendChild(folderIcon);
    preview.classList.add("folder-preview");

    // Double-click to navigate into folder
    container.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      onNavigate(item.path);
    });
  } else {
    // File - check if it's an image for thumbnail
    if (isImageFile(item.extension)) {
      const img = document.createElement("img");
      img.src = getThumbnailUrl(item.path);
      img.alt = item.name;
      img.loading = "lazy";
      img.onerror = () => {
        // Fallback to icon if image fails to load
        preview.innerHTML = "";
        const fileIcon = document.createElement("i");
        fileIcon.className = getFileIcon(item.extension);
        preview.appendChild(fileIcon);
        preview.classList.add("file-preview");
      };
      preview.appendChild(img);
      preview.classList.add("image-preview");
    } else {
      // Non-image file icon
      const fileIcon = document.createElement("i");
      fileIcon.className = getFileIcon(item.extension);
      preview.appendChild(fileIcon);
      preview.classList.add("file-preview");
    }
  }

  const label = document.createElement("div");
  label.className = "icon-label";
  label.textContent = item.name;
  label.title = item.name;

  container.appendChild(preview);
  container.appendChild(label);

  // Click handler for selection
  container.addEventListener("click", (e) => {
    e.stopPropagation();
    // Remove previous selection
    document.querySelectorAll(".icon-item.selected").forEach((el) => {
      el.classList.remove("selected");
    });
    container.classList.add("selected");

    // Dispatch custom event for file selection
    const event = new CustomEvent("jomanodes:file-selected", {
      detail: { path: item.path, name: item.name, type: item.type },
    });
    document.dispatchEvent(event);
  });

  return container;
}

// Create breadcrumb navigation for icon view
function createBreadcrumbs(path, onNavigate) {
  const container = document.createElement("div");
  container.className = "breadcrumbs";

  // Root/Home button
  const homeBtn = document.createElement("button");
  homeBtn.className = "breadcrumb-item";
  homeBtn.innerHTML = '<i class="pi pi-home"></i>';
  homeBtn.title = "Input folder";
  homeBtn.addEventListener("click", () => onNavigate(""));
  container.appendChild(homeBtn);

  if (path) {
    const parts = path.split("/");
    let currentPath = "";

    parts.forEach((part, index) => {
      // Separator
      const sep = document.createElement("span");
      sep.className = "breadcrumb-sep";
      sep.innerHTML = '<i class="pi pi-chevron-right"></i>';
      container.appendChild(sep);

      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const pathForClick = currentPath;

      const btn = document.createElement("button");
      btn.className = "breadcrumb-item";
      btn.textContent = part;
      if (index === parts.length - 1) {
        btn.classList.add("current");
      } else {
        btn.addEventListener("click", () => onNavigate(pathForClick));
      }
      container.appendChild(btn);
    });
  }

  return container;
}

// Render the file tree (LIST VIEW)
function renderListView(container, tree) {
  container.innerHTML = "";

  if (!tree || tree.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <i class="pi pi-inbox"></i>
      <p>No files in input folder</p>
    `;
    container.appendChild(empty);
    return;
  }

  const treeContainer = document.createElement("div");
  treeContainer.className = "file-tree";

  tree.forEach((item) => {
    treeContainer.appendChild(createTreeItem(item, 0));
  });

  container.appendChild(treeContainer);
}

// Render the icon grid (ICON VIEW)
function renderIconView(container, tree, onNavigate) {
  container.innerHTML = "";

  // Breadcrumbs
  const breadcrumbs = createBreadcrumbs(currentPath, onNavigate);
  container.appendChild(breadcrumbs);

  // Get items at current path
  const items = getItemsAtPath(tree, currentPath);

  if (!items || items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = `
      <i class="pi pi-inbox"></i>
      <p>This folder is empty</p>
    `;
    container.appendChild(empty);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "icon-grid";

  items.forEach((item) => {
    grid.appendChild(createIconItem(item, onNavigate));
  });

  container.appendChild(grid);
}

// Main render function that switches between views
function renderContent(container, tree, onNavigate) {
  if (currentViewMode === VIEW_MODES.LIST) {
    renderListView(container, tree);
  } else {
    renderIconView(container, tree, onNavigate);
  }
}

// Fetch and display the file tree
async function loadFileTree(container, onNavigate) {
  const loadingEl = document.createElement("div");
  loadingEl.className = "loading-state";
  loadingEl.innerHTML = `
    <i class="pi pi-spin pi-spinner"></i>
    <p>Loading files...</p>
  `;
  container.innerHTML = "";
  container.appendChild(loadingEl);

  try {
    const response = await api.fetchApi("/jomanodes/input/tree");
    const data = await response.json();

    if (data.success) {
      fileTreeData = data.tree;
      renderContent(container, data.tree, onNavigate);
    } else {
      container.innerHTML = `
        <div class="error-state">
          <i class="pi pi-exclamation-triangle"></i>
          <p>${data.error || "Failed to load files"}</p>
        </div>
      `;
    }
  } catch (error) {
    console.error("Error loading file tree:", error);
    container.innerHTML = `
      <div class="error-state">
        <i class="pi pi-exclamation-triangle"></i>
        <p>Error loading files</p>
      </div>
    `;
  }
}

// Inject styles
function injectStyles() {
  const styleId = "jomanodes-sidebar-styles";
  if (document.getElementById(styleId)) return;

  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    .jomanodes-sidebar {
      display: flex;
      flex-direction: column;
      height: 100%;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      color: var(--fg-color, #e0e0e0);
      background: var(--bg-color, #1e1e1e);
    }

    .sidebar-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border-color, #333);
      background: var(--comfy-menu-bg, #252525);
    }

    .sidebar-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: var(--fg-color, #e0e0e0);
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .sidebar-header .icon-btn {
      background: transparent;
      border: none;
      color: var(--fg-color, #999);
      cursor: pointer;
      padding: 6px 8px;
      border-radius: 4px;
      transition: all 0.15s ease;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .sidebar-header .icon-btn:hover {
      background: var(--comfy-input-bg, #333);
      color: var(--fg-color, #fff);
    }

    .sidebar-header .icon-btn.active {
      background: var(--p-primary-color, #4a9eff);
      color: white;
    }

    .view-toggle {
      display: flex;
      gap: 2px;
      margin-right: 8px;
      background: var(--comfy-input-bg, #333);
      border-radius: 4px;
      padding: 2px;
    }

    .view-toggle .icon-btn {
      padding: 4px 8px;
    }

    .sidebar-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    /* ===== LIST VIEW STYLES ===== */
    .file-tree {
      user-select: none;
    }

    .tree-item {
      margin: 1px 0;
    }

    .tree-row {
      display: flex;
      align-items: center;
      padding: 6px 8px;
      border-radius: 4px;
      cursor: pointer;
      transition: background 0.1s ease;
      gap: 6px;
    }

    .tree-row:hover {
      background: var(--comfy-input-bg, #333);
    }

    .tree-row.selected {
      background: var(--p-primary-color, #4a9eff);
      color: white;
    }

    .tree-row.selected .item-size {
      color: rgba(255, 255, 255, 0.7);
    }

    .expand-icon {
      font-size: 10px;
      width: 14px;
      color: var(--fg-color, #888);
      transition: transform 0.15s ease;
    }

    .expand-spacer {
      width: 14px;
      display: inline-block;
    }

    .folder-icon {
      color: #e8a838;
      font-size: 14px;
    }

    .file-icon {
      font-size: 14px;
      color: var(--fg-color, #888);
    }

    .item-name {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .item-size {
      font-size: 11px;
      color: var(--fg-color, #666);
      margin-left: auto;
    }

    .tree-children {
      overflow: hidden;
      transition: max-height 0.2s ease;
    }

    .tree-children.collapsed {
      display: none;
    }

    /* ===== ICON VIEW STYLES ===== */
    .breadcrumbs {
      display: flex;
      align-items: center;
      padding: 8px 4px;
      margin-bottom: 8px;
      background: var(--comfy-input-bg, #2a2a2a);
      border-radius: 6px;
      overflow-x: auto;
      gap: 2px;
    }

    .breadcrumb-item {
      background: transparent;
      border: none;
      color: var(--fg-color, #888);
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      white-space: nowrap;
      transition: all 0.15s ease;
    }

    .breadcrumb-item:hover:not(.current) {
      background: var(--comfy-input-bg, #444);
      color: var(--fg-color, #fff);
    }

    .breadcrumb-item.current {
      color: var(--fg-color, #fff);
      cursor: default;
      font-weight: 500;
    }

    .breadcrumb-sep {
      color: var(--fg-color, #555);
      font-size: 10px;
      display: flex;
      align-items: center;
    }

    .icon-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
      gap: 12px;
      padding: 4px;
    }

    .icon-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }

    .icon-item:hover {
      background: var(--comfy-input-bg, #333);
    }

    .icon-item.selected {
      background: var(--p-primary-color, #4a9eff);
      color: white;
    }

    .icon-preview {
      width: 72px;
      height: 72px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      margin-bottom: 6px;
      overflow: hidden;
      background: var(--comfy-input-bg, #2a2a2a);
    }

    .icon-preview.folder-preview {
      background: transparent;
    }

    .icon-preview.folder-preview i {
      font-size: 48px;
      color: #e8a838;
    }

    .icon-preview.file-preview i {
      font-size: 32px;
      color: var(--fg-color, #888);
    }

    .icon-preview.image-preview {
      background: #1a1a1a;
    }

    .icon-preview.image-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .icon-label {
      font-size: 11px;
      text-align: center;
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      line-height: 1.3;
    }

    .icon-item.selected .icon-label {
      color: white;
    }

    .icon-item.selected .icon-preview.file-preview i {
      color: white;
    }

    /* ===== COMMON STATES ===== */
    .empty-state,
    .loading-state,
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 20px;
      color: var(--fg-color, #666);
      text-align: center;
    }

    .empty-state i,
    .loading-state i,
    .error-state i {
      font-size: 32px;
      margin-bottom: 12px;
      opacity: 0.5;
    }

    .error-state {
      color: #e57373;
    }

    .error-state i {
      color: #e57373;
    }

    .loading-state i {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

// Register the sidebar
app.extensionManager.registerSidebarTab({
  id: "projectSidebar",
  icon: "pi pi-folder",
  title: "Project",
  tooltip: "Browse input folder contents",
  type: "custom",
  render: (el) => {
    injectStyles();

    el.innerHTML = `
      <div class="jomanodes-sidebar">
        <div class="sidebar-header">
          <h3>Input Files</h3>
          <div class="header-actions">
            <div class="view-toggle">
              <button class="icon-btn list-view-btn active" title="List view">
                <i class="pi pi-list"></i>
              </button>
              <button class="icon-btn icon-view-btn" title="Icon view">
                <i class="pi pi-th-large"></i>
              </button>
            </div>
            <button class="icon-btn refresh-btn" title="Refresh">
              <i class="pi pi-refresh"></i>
            </button>
          </div>
        </div>
        <div class="sidebar-content"></div>
      </div>
    `;

    const content = el.querySelector(".sidebar-content");
    const refreshBtn = el.querySelector(".refresh-btn");
    const listViewBtn = el.querySelector(".list-view-btn");
    const iconViewBtn = el.querySelector(".icon-view-btn");

    // Navigation handler for icon view
    const handleNavigate = (path) => {
      currentPath = path;
      if (fileTreeData) {
        renderContent(content, fileTreeData, handleNavigate);
      }
    };

    // Load initial file tree
    loadFileTree(content, handleNavigate);

    // Refresh button handler
    refreshBtn.addEventListener("click", () => {
      loadFileTree(content, handleNavigate);
    });

    // View toggle handlers
    listViewBtn.addEventListener("click", () => {
      if (currentViewMode === VIEW_MODES.LIST) return;
      currentViewMode = VIEW_MODES.LIST;
      listViewBtn.classList.add("active");
      iconViewBtn.classList.remove("active");
      if (fileTreeData) {
        renderContent(content, fileTreeData, handleNavigate);
      }
    });

    iconViewBtn.addEventListener("click", () => {
      if (currentViewMode === VIEW_MODES.ICON) return;
      currentViewMode = VIEW_MODES.ICON;
      currentPath = ""; // Reset to root when switching to icon view
      iconViewBtn.classList.add("active");
      listViewBtn.classList.remove("active");
      if (fileTreeData) {
        renderContent(content, fileTreeData, handleNavigate);
      }
    });
  },
});
