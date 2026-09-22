document.addEventListener("DOMContentLoaded", async () => {
    await initializeExtensionState();
    await loadSettings();
    setupSettingsListeners();
    setupDataControls();
});


/* ========================================
   Settings
   ======================================== */

async function loadSettings() {
    const state = await getExtensionState();

    document.getElementById("globalEnabled").checked =
        state.settings.globalEnabled;

    document.getElementById("trigger").value =
        state.settings.trigger;

    document.getElementById("requireDelimiter").checked =
        state.settings.requireDelimiter;

    document.getElementById("immediateExpansion").checked =
        state.settings.immediateExpansion;

    document.getElementById("incognitoEnabled").checked =
        state.settings.incognitoEnabled;

    const caseRadio = document.querySelector(
        `input[name="profileCase"][value="${state.settings.profileNameCaseSensitive}"]`
    );

    if (caseRadio) {
        caseRadio.checked = true;
    }
}


function setupSettingsListeners() {
    document
        .getElementById("globalEnabled")
        .addEventListener("change", saveSettings);

    document
        .getElementById("trigger")
        .addEventListener("change", saveSettings);

    document
        .getElementById("requireDelimiter")
        .addEventListener("change", saveSettings);

    document
        .getElementById("immediateExpansion")
        .addEventListener("change", saveSettings);

    document
        .getElementById("incognitoEnabled")
        .addEventListener("change", saveSettings);

    document
        .querySelectorAll('input[name="profileCase"]')
        .forEach(input => {
            input.addEventListener("change", handleProfileCaseChange);
        });
}


async function saveSettings() {
    const state = await getExtensionState();

    const trigger = document
        .getElementById("trigger")
        .value
        .trim();

    if (!trigger) {
        alert("Trigger cannot be empty.");
        await loadSettings();
        return;
    }

    state.settings.globalEnabled =
        document.getElementById("globalEnabled").checked;

    state.settings.trigger = trigger;

    state.settings.requireDelimiter =
        document.getElementById("requireDelimiter").checked;

    state.settings.immediateExpansion =
        document.getElementById("immediateExpansion").checked;

    state.settings.incognitoEnabled =
        document.getElementById("incognitoEnabled").checked;

    await saveExtensionState(state);
}


async function handleProfileCaseChange(event) {
    const newValue = event.target.value === "true";
    const state = await getExtensionState();

    if (state.settings.profileNameCaseSensitive === newValue) {
        return;
    }

    if (!newValue) {
        const seen = new Set();
        const conflicts = [];

        for (const profile of state.profiles) {
            const normalized = profile.name.trim().toLowerCase();

            if (seen.has(normalized)) {
                conflicts.push(profile.name);
            } else {
                seen.add(normalized);
            }
        }

        if (conflicts.length > 0) {
            alert(
                "Case-insensitive matching cannot be enabled because some profile names would conflict.\n\n" +
                conflicts.join("\n") +
                "\n\nRename the conflicting profiles first."
            );

            await loadSettings();
            return;
        }
    }

    state.settings.profileNameCaseSensitive = newValue;
    await saveExtensionState(state);
}


/* ========================================
   Data controls
   ======================================== */

let importFiles = [];
let importConflictMode = null;
let pendingConflictResolve = null;
let importDragHandlersAttached = false;


function setupDataControls() {
    document
        .getElementById("exportShortcutsButton")
        .addEventListener("click", openExportModal);

    document
        .getElementById("importShortcutsButton")
        .addEventListener("click", openImportModal);

    setupExportModal();
    setupImportModal();
    setupConflictModal();
    setupModalKeyboardHandling();
}


function setupModalKeyboardHandling() {
    document.addEventListener("keydown", event => {
        if (event.key !== "Escape") {
            return;
        }

        const conflictModal = document.getElementById("importConflictModal");

        if (conflictModal && !conflictModal.classList.contains("hidden")) {
            return;
        }

        const importModal = document.getElementById("importModal");
        if (importModal && !importModal.classList.contains("hidden")) {
            closeImportModal();
            return;
        }

        const exportModal = document.getElementById("exportModal");
        if (exportModal && !exportModal.classList.contains("hidden")) {
            closeExportModal();
        }
    });
}


/* ========================================
   Export
   ======================================== */

function closeExportModal() {
    closeModal("exportModal");
}


function setupExportModal() {
    document
        .getElementById("exportModalClose")
        .addEventListener("click", closeExportModal);

    document
        .getElementById("exportModalCancel")
        .addEventListener("click", closeExportModal);

    document
        .getElementById("exportModalConfirm")
        .addEventListener("click", exportSelectedProfiles);

    document
        .getElementById("exportSelectAll")
        .addEventListener("change", event => {
            document
                .querySelectorAll('#exportProfileList input[type="checkbox"]')
                .forEach(input => {
                    input.checked = event.target.checked;
                });

            updateExportSelectionState();
        });

    document
        .getElementById("exportProfileList")
        .addEventListener("change", updateExportSelectionState);

    document
        .getElementById("exportModal")
        .addEventListener("click", event => {
            if (event.target.id === "exportModal") {
                closeExportModal();
            }
        });
}


async function openExportModal() {
    const state = await getExtensionState();
    const list = document.getElementById("exportProfileList");
    const error = document.getElementById("exportModalError");

    error.textContent = "";
    list.innerHTML = "";

    if (state.profiles.length === 0) {
        list.innerHTML = `
            <div class="data-empty-state">
                No profiles yet. Create a profile before exporting shortcuts.
            </div>
        `;
    } else {
        for (const profile of state.profiles) {
            const shortcutCount = state.shortcuts.filter(
                shortcut => shortcut.profileId === profile.id
            ).length;

            const row = document.createElement("label");
            row.className = "profile-check-row";
            row.innerHTML = `
                <input
                    type="checkbox"
                    value="${escapeHtml(profile.id)}"
                    checked
                >
                <span class="profile-check-copy">
                    <strong>${escapeHtml(profile.name)}</strong>
                    <small>${shortcutCount} shortcut${shortcutCount === 1 ? "" : "s"}</small>
                </span>
            `;
            list.appendChild(row);
        }
    }

    document.getElementById("exportSelectAll").checked =
        state.profiles.length > 0;

    updateExportSelectionState();
    openModal("exportModal");
}


function updateExportSelectionState() {
    const inputs = [
        ...document.querySelectorAll('#exportProfileList input[type="checkbox"]')
    ];

    const checkedCount = inputs.filter(input => input.checked).length;
    const selectAll = document.getElementById("exportSelectAll");
    const label = document.getElementById("exportSelectAllLabel");
    const confirm = document.getElementById("exportModalConfirm");

    selectAll.checked = inputs.length > 0 && checkedCount === inputs.length;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < inputs.length;
    label.textContent = selectAll.checked ? "Deselect all" : "Select all";
    confirm.disabled = checkedCount === 0;
}


async function exportSelectedProfiles() {
    const state = await getExtensionState();
    const format = document.getElementById("exportFormat").value;
    const selectedIds = [
        ...document.querySelectorAll('#exportProfileList input[type="checkbox"]:checked')
    ].map(input => input.value);

    const error = document.getElementById("exportModalError");

    if (selectedIds.length === 0) {
        error.textContent = "Select at least one profile.";
        return;
    }

    const selectedProfiles = state.profiles.filter(profile =>
        selectedIds.includes(profile.id)
    );

    closeExportModal();

    // Each selected profile is exported as its own file.
    for (const profile of selectedProfiles) {
        const shortcuts = state.shortcuts.filter(
            shortcut => shortcut.profileId === profile.id
        );

        if (format === "json") {
            const payload = {
                schemaVersion: 1,
                type: "lesstype-shortcuts",
                profile: {
                    name: profile.name
                },
                shortcuts: shortcuts.map(shortcut => ({
                    key: shortcut.key,
                    replacement: shortcut.replacement,
                    enabled: shortcut.enabled !== false
                }))
            };

            downloadTextFile(
                `${safeFilename(profile.name)}.json`,
                JSON.stringify(payload, null, 2),
                "application/json;charset=utf-8"
            );
        } else {
            const rows = [
                ["Profile", "Shortcut", "Replacement", "Enabled"]
            ];

            for (const shortcut of shortcuts) {
                rows.push([
                    profile.name,
                    shortcut.key,
                    shortcut.replacement,
                    shortcut.enabled !== false ? "true" : "false"
                ]);
            }

            downloadTextFile(
                `${safeFilename(profile.name)}.csv`,
                rows.map(row => row.map(csvEscape).join(",")).join("\r\n"),
                "text/csv;charset=utf-8"
            );
        }

        // Give the browser a moment between multiple downloads.
        await delay(80);
    }
}


/* ========================================
   Import
   ======================================== */

function setupImportModal() {
    const fileInput = document.getElementById("importFileInput");
    const browseButton = document.getElementById("browseImportFiles");
    const dropZone = document.getElementById("importDropZone");

    browseButton.addEventListener("click", event => {
        event.stopPropagation();
        fileInput.click();
    });

    dropZone.addEventListener("click", () => fileInput.click());

    dropZone.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            fileInput.click();
        }
    });

    fileInput.addEventListener("change", event => {
        addImportFiles(event.target.files);
        event.target.value = "";
    });

    document
        .getElementById("importModalClose")
        .addEventListener("click", closeImportModal);

    document
        .getElementById("importModalCancel")
        .addEventListener("click", closeImportModal);

    document
        .getElementById("importModalConfirm")
        .addEventListener("click", importSelectedFiles);

    document
        .getElementById("importModal")
        .addEventListener("click", event => {
            if (event.target.id === "importModal") {
                closeImportModal();
            }
        });
}


function openImportModal() {
    importFiles = [];
    importConflictMode = null;
    renderImportFileList();
    document.getElementById("importModalError").textContent = "";
    openModal("importModal");
    attachGlobalDropHandlers();
}


function closeImportModal() {
    if (!document.getElementById("importConflictModal").classList.contains("hidden")) {
        return;
    }

    detachGlobalDropHandlers();
    closeModal("importModal");
}


function attachGlobalDropHandlers() {
    if (importDragHandlersAttached) {
        return;
    }

    document.addEventListener("dragover", handleGlobalDragOver);
    document.addEventListener("drop", handleGlobalDrop);
    document.addEventListener("dragenter", handleGlobalDragEnter);
    document.addEventListener("dragleave", handleGlobalDragLeave);
    importDragHandlersAttached = true;
}


function detachGlobalDropHandlers() {
    document.removeEventListener("dragover", handleGlobalDragOver);
    document.removeEventListener("drop", handleGlobalDrop);
    document.removeEventListener("dragenter", handleGlobalDragEnter);
    document.removeEventListener("dragleave", handleGlobalDragLeave);
    document.body.classList.remove("is-file-dragging");
    importDragHandlersAttached = false;
}


function handleGlobalDragOver(event) {
    if (!isImportModalOpen()) {
        return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
}


function handleGlobalDragEnter(event) {
    if (!isImportModalOpen() || !hasFiles(event.dataTransfer)) {
        return;
    }

    event.preventDefault();
    document.body.classList.add("is-file-dragging");
}


function handleGlobalDragLeave(event) {
    if (event.relatedTarget === null) {
        document.body.classList.remove("is-file-dragging");
    }
}


function handleGlobalDrop(event) {
    if (!isImportModalOpen()) {
        return;
    }

    event.preventDefault();
    document.body.classList.remove("is-file-dragging");
    addImportFiles(event.dataTransfer.files);
}


function hasFiles(dataTransfer) {
    return Boolean(
        dataTransfer &&
        [...(dataTransfer.types || [])].includes("Files")
    );
}


function addImportFiles(fileList) {
    const files = [...(fileList || [])];
    const error = document.getElementById("importModalError");

    const unsupported = files.filter(file => !isSupportedImportFile(file));
    if (unsupported.length > 0) {
        error.textContent =
            `Unsupported file${unsupported.length === 1 ? "" : "s"}: ` +
            unsupported.map(file => file.name).join(", ") +
            ". Only JSON and CSV files are supported.";
    } else {
        error.textContent = "";
    }

    for (const file of files) {
        if (!isSupportedImportFile(file)) {
            continue;
        }

        const duplicate = importFiles.some(existing =>
            existing.name === file.name &&
            existing.size === file.size &&
            existing.lastModified === file.lastModified
        );

        if (!duplicate) {
            importFiles.push(file);
        }
    }

    renderImportFileList();
}


function isSupportedImportFile(file) {
    const name = String(file?.name || "").toLowerCase();
    return name.endsWith(".json") || name.endsWith(".csv");
}


function renderImportFileList() {
    const list = document.getElementById("importFileList");
    const confirm = document.getElementById("importModalConfirm");

    list.innerHTML = "";

    if (importFiles.length === 0) {
        list.innerHTML = `
            <div class="data-empty-state">No files added yet.</div>
        `;
    } else {
        importFiles.forEach((file, index) => {
            const row = document.createElement("div");
            row.className = "import-file-row";

            const meta = document.createElement("div");
            meta.className = "import-file-meta";
            meta.innerHTML = `
                <strong>${escapeHtml(file.name)}</strong>
                <small>${formatFileSize(file.size)} · ${getFileExtension(file).toUpperCase()}</small>
            `;

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "file-remove-button";
            remove.textContent = "Remove";
            remove.setAttribute("aria-label", `Remove ${file.name}`);
            remove.addEventListener("click", () => {
                importFiles.splice(index, 1);
                renderImportFileList();
            });

            row.appendChild(meta);
            row.appendChild(remove);
            list.appendChild(row);
        });
    }

    confirm.disabled = importFiles.length === 0;
}


async function importSelectedFiles() {
    if (importFiles.length === 0) {
        return;
    }

    const error = document.getElementById("importModalError");
    error.textContent = "";

    const importButton = document.getElementById("importModalConfirm");
    importButton.disabled = true;

    try {
        const records = [];

        for (const file of importFiles) {
            const text = await file.text();
            const parsed = parseImportFile(file, text);
            records.push(...parsed);
        }

        if (records.length === 0) {
            throw new Error("The selected files do not contain any shortcuts to import.");
        }

        closeModal("importModal");
        detachGlobalDropHandlers();

        try {
            await applyImportedRecords(records);
        } catch (err) {
            openModal("importModal");
            attachGlobalDropHandlers();
            error.textContent = err.message || "Unable to import shortcuts.";
            importButton.disabled = false;
            return;
        }

        importFiles = [];
        importConflictMode = null;
        alert("Shortcuts imported successfully.");
    } catch (err) {
        error.textContent = err.message || "Unable to import shortcuts.";
        importButton.disabled = false;
    }
}


function parseImportFile(file, text) {
    const extension = getFileExtension(file);

    if (extension === "json") {
        return parseJsonImport(text, file.name);
    }

    return parseCsvImport(text, file.name);
}


function parseJsonImport(text, filename) {
    let data;

    try {
        data = JSON.parse(text);
    } catch {
        throw new Error(`Could not parse ${filename} as JSON.`);
    }

    const records = [];

    // Native LessType profile export format.
    if (
        data &&
        typeof data === "object" &&
        data.profile &&
        Array.isArray(data.shortcuts)
    ) {
        const profileName = String(data.profile.name ?? "").trim();
        if (!profileName) {
            throw new Error(`${filename}: profile name is missing.`);
        }
        records.push(...normalizeShortcutRecords(
            data.shortcuts,
            profileName,
            filename
        ));
        return records;
    }

    // Native multi-profile / backup-friendly format.
    if (data && typeof data === "object" && Array.isArray(data.profiles)) {
        for (const profile of data.profiles) {
            const profileName = String(profile?.name ?? "").trim();
            if (!profileName) {
                throw new Error(`${filename}: a profile is missing its name.`);
            }
            records.push(...normalizeShortcutRecords(
                profile.shortcuts,
                profileName,
                filename
            ));
        }
        return records;
    }

    // Array of flat shortcut rows.
    if (Array.isArray(data)) {
        return normalizeFlatRecords(data, filename);
    }

    // Single flat shortcut object.
    if (data && typeof data === "object") {
        return normalizeFlatRecords([data], filename);
    }

    throw new Error(`${filename}: unsupported JSON format.`);
}


function normalizeShortcutRecords(shortcuts, profileName, filename) {
    if (!Array.isArray(shortcuts)) {
        throw new Error(`${filename}: shortcuts must be an array.`);
    }

    return shortcuts.map((shortcut, index) => {
        if (!shortcut || typeof shortcut !== "object") {
            throw new Error(`${filename}: shortcut ${index + 1} is invalid.`);
        }

        return normalizeRecord({
            profileName,
            key: shortcut.key ?? shortcut.shortcut ?? shortcut.Shortcut,
            replacement: shortcut.replacement ?? shortcut.Replacement,
            enabled: shortcut.enabled ?? shortcut.Enabled
        }, filename, index + 1);
    });
}


function normalizeFlatRecords(rows, filename) {
    return rows.map((row, index) => {
        if (!row || typeof row !== "object") {
            throw new Error(`${filename}: row ${index + 1} is invalid.`);
        }

        return normalizeRecord({
            profileName:
                row.profileName ??
                row.profile ??
                row.Profile,
            key:
                row.key ??
                row.shortcut ??
                row.Shortcut,
            replacement:
                row.replacement ??
                row.Replacement,
            enabled:
                row.enabled ??
                row.Enabled
        }, filename, index + 1);
    });
}


function normalizeRecord(raw, filename, rowNumber) {
    const profileName = String(raw.profileName ?? "").trim();
    const key = String(raw.key ?? "").trim();
    const replacement = String(raw.replacement ?? "");

    if (!profileName) {
        throw new Error(`${filename}: row ${rowNumber} is missing a profile name.`);
    }

    if (!key) {
        throw new Error(`${filename}: row ${rowNumber} is missing a shortcut key.`);
    }

    if (!replacement.trim()) {
        throw new Error(`${filename}: row ${rowNumber} has an empty replacement.`);
    }

    if (/\r|\n/.test(key)) {
        throw new Error(`${filename}: row ${rowNumber} has a multiline shortcut key.`);
    }

    return {
        profileName,
        key,
        replacement,
        enabled: parseEnabled(raw.enabled)
    };
}


function parseEnabled(value) {
    if (value === undefined || value === null || value === "") {
        return true;
    }

    if (typeof value === "boolean") {
        return value;
    }

    return !["false", "0", "no", "off"].includes(
        String(value).trim().toLowerCase()
    );
}


function parseCsvImport(text, filename) {
    const rows = parseCsv(text);

    if (rows.length === 0) {
        return [];
    }

    const headers = rows[0].map(value =>
        String(value).trim().toLowerCase()
    );

    const profileIndex = findHeader(headers, ["profile", "profilename"]);
    const keyIndex = findHeader(headers, ["shortcut", "key"]);
    const replacementIndex = findHeader(headers, ["replacement"]);
    const enabledIndex = findHeader(headers, ["enabled"]);

    if (profileIndex === -1 || keyIndex === -1 || replacementIndex === -1) {
        throw new Error(
            `${filename}: CSV must contain Profile, Shortcut, and Replacement columns.`
        );
    }

    return rows.slice(1)
        .filter(row => row.some(value => String(value).trim() !== ""))
        .map((row, index) => normalizeRecord({
            profileName: row[profileIndex],
            key: row[keyIndex],
            replacement: row[replacementIndex],
            enabled: enabledIndex === -1 ? undefined : row[enabledIndex]
        }, filename, index + 2));
}


function findHeader(headers, names) {
    return headers.findIndex(header => names.includes(header));
}


function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];

        if (inQuotes) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 1;
                } else {
                    inQuotes = false;
                }
            } else {
                field += char;
            }
            continue;
        }

        if (char === '"' && field === "") {
            inQuotes = true;
            continue;
        }

        if (char === ",") {
            row.push(field);
            field = "";
            continue;
        }

        if (char === "\r") {
            if (text[i + 1] === "\n") {
                i += 1;
            }
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
            continue;
        }

        if (char === "\n") {
            row.push(field);
            rows.push(row);
            row = [];
            field = "";
            continue;
        }

        field += char;
    }

    if (inQuotes) {
        throw new Error("CSV contains an unterminated quoted field.");
    }

    if (field !== "" || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    return rows;
}


/* ========================================
   Import application + conflicts
   ======================================== */

async function applyImportedRecords(records) {
    const state = await getExtensionState();
    importConflictMode = null;

    for (const record of records) {
        const profile = findProfileByName(
            state.profiles,
            record.profileName,
            state.settings.profileNameCaseSensitive
        );

        let targetProfile = profile;

        if (!targetProfile) {
            const now = Date.now();
            targetProfile = {
                id: crypto.randomUUID(),
                name: record.profileName,
                createdAt: now,
                updatedAt: now
            };
            state.profiles.push(targetProfile);
        }

        const existing = state.shortcuts.find(shortcut =>
            shortcut.profileId === targetProfile.id &&
            normalizeShortcutKey(shortcut.key) === normalizeShortcutKey(record.key)
        );

        if (!existing) {
            const now = Date.now();
            state.shortcuts.push({
                id: crypto.randomUUID(),
                profileId: targetProfile.id,
                key: record.key,
                replacement: record.replacement,
                enabled: record.enabled,
                createdAt: now,
                updatedAt: now
            });
            continue;
        }

        let action = importConflictMode;

        if (!action) {
            action = await askImportConflict(existing, targetProfile, record);

            if (action === "skip-all") {
                importConflictMode = "skip";
                continue;
            }

            if (action === "overwrite-all") {
                importConflictMode = "overwrite";
                action = "overwrite";
            }
        }

        if (action === "overwrite") {
            existing.key = record.key;
            existing.replacement = record.replacement;
            existing.enabled = record.enabled;
            existing.updatedAt = Date.now();
        }
    }

    await saveExtensionState(state);
}


function findProfileByName(profiles, name, caseSensitive) {
    const normalized = normalizeProfileNameForImport(name, caseSensitive);

    return profiles.find(profile =>
        normalizeProfileNameForImport(profile.name, caseSensitive) === normalized
    ) ?? null;
}


function normalizeProfileNameForImport(name, caseSensitive) {
    const trimmed = String(name ?? "").trim();
    return caseSensitive ? trimmed : trimmed.toLowerCase();
}


function askImportConflict(existing, profile, record) {
    if (importConflictMode === "skip") {
        return Promise.resolve("skip");
    }

    if (importConflictMode === "overwrite") {
        return Promise.resolve("overwrite");
    }

    return new Promise(resolve => {
        pendingConflictResolve = resolve;

        document.getElementById("conflictStoredProfile").textContent =
            profile.name;
        document.getElementById("conflictStoredKey").textContent =
            existing.key;
        document.getElementById("conflictStoredReplacement").textContent =
            existing.replacement;

        document.getElementById("conflictUploadedProfile").textContent =
            record.profileName;
        document.getElementById("conflictUploadedKey").textContent =
            record.key;
        document.getElementById("conflictUploadedReplacement").textContent =
            record.replacement;

        openModal("importConflictModal");
    });
}


function setupConflictModal() {
    document
        .getElementById("conflictSkip")
        .addEventListener("click", () => resolveConflict("skip"));

    document
        .getElementById("conflictSkipAll")
        .addEventListener("click", () => {
            importConflictMode = "skip";
            resolveConflict("skip");
        });

    document
        .getElementById("conflictOverwrite")
        .addEventListener("click", () => resolveConflict("overwrite"));

    document
        .getElementById("conflictOverwriteAll")
        .addEventListener("click", () => {
            importConflictMode = "overwrite";
            resolveConflict("overwrite");
        });
}


function resolveConflict(action) {
    closeModal("importConflictModal");

    const resolve = pendingConflictResolve;
    pendingConflictResolve = null;

    if (resolve) {
        resolve(action);
    }
}


/* ========================================
   Modal helpers
   ======================================== */

function openModal(id) {
    document.getElementById(id).classList.remove("hidden");
}


function closeModal(id) {
    const modal = document.getElementById(id);

    if (!modal) {
        return;
    }

    modal.classList.add("hidden");
}


function isImportModalOpen() {
    return !document
        .getElementById("importModal")
        .classList.contains("hidden");
}


/* ========================================
   File helpers
   ======================================== */

function getFileExtension(file) {
    const name = String(file?.name || "").toLowerCase();
    const index = name.lastIndexOf(".");
    return index === -1 ? "" : name.slice(index + 1);
}


function formatFileSize(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}


function downloadTextFile(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = "none";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}


function csvEscape(value) {
    const string = String(value ?? "");

    if (/[",\r\n]/.test(string)) {
        return `"${string.replaceAll('"', '""')}"`;
    }

    return string;
}


function safeFilename(name) {
    return String(name)
        .replace(/[<>:"/\\|?*]/g, "_")
        .trim() || "profile";
}


function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
