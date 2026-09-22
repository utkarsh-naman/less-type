let currentView = {
    type: "all",
    profileId: null
};

let editingProfileId = null;
let editingShortcutId = null;
let currentShortcuts = [];


document.addEventListener("DOMContentLoaded", async () => {
    await initializeExtensionState();

    setupStaticIcons();
    setupNavigation();
    setupProfileModal();
    setupShortcutModal();
    setupSearch();

    await renderProfiles();
    await renderShortcuts();
    renderPageTitle();

    handleInitialUrlAction();
});


/* ========================================
   Icons
   ======================================== */

function setupStaticIcons() {
    document.getElementById("settingsIcon").innerHTML =
        LTIcons.settings;

    document.getElementById("newProfileIcon").innerHTML =
        LTIcons.plus;

    document.getElementById("profileModalCloseIcon").innerHTML =
        LTIcons.close;

    document.getElementById("shortcutModalCloseIcon").innerHTML =
        LTIcons.close;

    document.getElementById("searchIcon").innerHTML =
        LTIcons.search;
}


/* ========================================
   Navigation
   ======================================== */

function setupNavigation() {
    document
        .getElementById("allShortcutsButton")
        .addEventListener("click", async () => {
            currentView = {
                type: "all",
                profileId: null
            };

            await renderProfiles();
            await renderShortcuts();
            renderPageTitle();
        });

    document
        .getElementById("settingsButton")
        .addEventListener(
            "click",
            () => chrome.runtime.openOptionsPage()
        );

    document
        .getElementById("newProfileButton")
        .addEventListener(
            "click",
            () => openProfileModal()
        );

    document
        .getElementById("addShortcutButton")
        .addEventListener(
            "click",
            () => openShortcutModal()
        );
}


function setupSearch() {
    document
        .getElementById("searchInput")
        .addEventListener(
            "input",
            () => renderShortcuts()
        );
}


/* ========================================
   Profiles
   ======================================== */

async function renderProfiles() {
    const state = await getExtensionState();
    const list = document.getElementById("profileList");
    const allButton = document.getElementById("allShortcutsButton");

    list.innerHTML = "";
    allButton.classList.toggle(
        "active",
        currentView.type === "all"
    );

    for (const profile of state.profiles) {
        const row = document.createElement("div");
        row.className = "profile-row";

        if (
            currentView.type === "profile" &&
            currentView.profileId === profile.id
        ) {
            row.classList.add("active");
        }

        const button = document.createElement("button");
        button.type = "button";
        button.className = "sidebar-item";
        button.innerHTML =
            `<span>${escapeHtml(profile.name)}</span>`;

        button.addEventListener("click", async () => {
            currentView = {
                type: "profile",
                profileId: profile.id
            };

            await renderProfiles();
            await renderShortcuts();
            renderPageTitle();
        });

        const menuButton = document.createElement("button");
        menuButton.type = "button";
        menuButton.className = "profile-menu-button";
        menuButton.setAttribute(
            "aria-label",
            `Options for ${profile.name}`
        );
        menuButton.innerHTML =
            `<span class="lt-icon">${LTIcons.more}</span>`;

        menuButton.addEventListener("click", event => {
            event.stopPropagation();
            openProfileMenu(profile, menuButton);
        });

        row.appendChild(button);
        row.appendChild(menuButton);
        list.appendChild(row);
    }
}


/* ========================================
   Profile menu
   ======================================== */

function openProfileMenu(profile, anchor) {
    closeProfileMenus();

    const menu = document.createElement("div");
    menu.className = "profile-menu";

    const rename = createMenuItem(
        LTIcons.edit,
        "Rename"
    );

    rename.addEventListener("click", () => {
        closeProfileMenus();
        openProfileModal(profile);
    });

    const exportProfile = createMenuItem(
        LTIcons.download,
        "Export profile"
    );

    exportProfile.addEventListener("click", async () => {
        closeProfileMenus();
        await exportProfileCsv(profile);
    });

    const deleteProfileButton = createMenuItem(
        LTIcons.trash,
        "Delete profile",
        true
    );

    deleteProfileButton.addEventListener("click", async () => {
        closeProfileMenus();
        await confirmDeleteProfile(profile);
    });

    menu.appendChild(rename);
    menu.appendChild(exportProfile);
    menu.appendChild(deleteProfileButton);
    document.body.appendChild(menu);

    const rect = anchor.getBoundingClientRect();

    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${Math.max(
        8,
        rect.right - menu.offsetWidth
    )}px`;

    setTimeout(() => {
        document.addEventListener(
            "click",
            closeProfileMenus,
            { once: true }
        );
    });
}


function createMenuItem(icon, label, danger = false) {
    const button = document.createElement("button");

    button.type = "button";

    if (danger) {
        button.classList.add("danger");
    }

    button.innerHTML = `
        <span class="lt-icon">
            ${icon}
        </span>
        <span>${escapeHtml(label)}</span>
    `;

    return button;
}


function closeProfileMenus() {
    document
        .querySelectorAll(".profile-menu")
        .forEach(menu => menu.remove());
}


/* ========================================
   Profile modal
   ======================================== */

function setupProfileModal() {
    const modal = document.getElementById("profileModal");

    document
        .getElementById("profileModalClose")
        .addEventListener("click", closeProfileModal);

    document
        .getElementById("profileModalCancel")
        .addEventListener("click", closeProfileModal);

    document
        .getElementById("profileModalSave")
        .addEventListener("click", saveProfileModal);

    document
        .getElementById("profileNameInput")
        .addEventListener("keydown", event => {
            if (event.key === "Enter") {
                event.preventDefault();
                saveProfileModal();
            }

            if (event.key === "Escape") {
                event.preventDefault();
                closeProfileModal();
            }
        });

    modal.addEventListener("click", event => {
        if (event.target === modal) {
            closeProfileModal();
        }
    });
}


function openProfileModal(profile = null) {
    editingProfileId = profile?.id ?? null;

    document.getElementById("profileModalTitle").textContent =
        profile ? "Rename Profile" : "New Profile";

    document.getElementById("profileModalSave").textContent =
        profile ? "Save Changes" : "Create Profile";

    document.getElementById("profileNameInput").value =
        profile?.name ?? "";

    document.getElementById("profileModalError").textContent = "";

    document
        .getElementById("profileModal")
        .classList.remove("hidden");

    setTimeout(() => {
        const input = document.getElementById("profileNameInput");
        input.focus();
        input.select();
    }, 0);
}


function closeProfileModal() {
    editingProfileId = null;

    document
        .getElementById("profileModal")
        .classList.add("hidden");
}


async function saveProfileModal() {
    const input = document.getElementById("profileNameInput");
    const error = document.getElementById("profileModalError");
    const name = input.value.trim();

    if (!name) {
        error.textContent = "Profile name cannot be empty.";
        input.focus();
        return;
    }

    const isCreating = !editingProfileId;

    try {
        let profile;

        if (isCreating) {
            profile = await createProfile(name);
        } else {
            profile = await renameProfile(
                editingProfileId,
                name
            );
        }

        closeProfileModal();

        if (isCreating) {
            currentView = {
                type: "profile",
                profileId: profile.id
            };
        }

        await renderProfiles();
        await renderShortcuts();
        renderPageTitle();
    } catch (err) {
        error.textContent =
            err.message ||
            "Unable to save profile.";
    }
}


/* ========================================
   Shortcut modal / CRUD
   ======================================== */

function setupShortcutModal() {
    const modal = document.getElementById("shortcutModal");
    const form = document.getElementById("shortcutForm");

    document
        .getElementById("shortcutModalClose")
        .addEventListener("click", closeShortcutModal);

    document
        .getElementById("shortcutModalCancel")
        .addEventListener("click", closeShortcutModal);

    form.addEventListener("submit", event => {
        event.preventDefault();
        saveShortcutModal();
    });

    document
        .getElementById("shortcutKeyInput")
        .addEventListener("keydown", event => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeShortcutModal();
            }

            if (event.key === "Enter") {
                event.preventDefault();
                saveShortcutModal();
            }
        });

    document
        .getElementById("shortcutProfileInput")
        .addEventListener("keydown", event => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeShortcutModal();
            }
        });

    document
        .getElementById("shortcutReplacementInput")
        .addEventListener("keydown", event => {
            if (event.key === "Escape") {
                event.preventDefault();
                closeShortcutModal();
            }

            if (
                event.key === "Enter" &&
                (event.ctrlKey || event.metaKey)
            ) {
                event.preventDefault();
                saveShortcutModal();
            }
        });

    modal.addEventListener("click", event => {
        if (event.target === modal) {
            closeShortcutModal();
        }
    });
}


async function openShortcutModal(shortcut = null, preferredProfileId = null) {
    const state = await getExtensionState();

    if (state.profiles.length === 0) {
        alert("Create a profile before adding a shortcut.");
        openProfileModal();
        return;
    }

    editingShortcutId = shortcut?.id ?? null;

    const profileSelect =
        document.getElementById("shortcutProfileInput");

    profileSelect.innerHTML = state.profiles
        .map(profile => `
            <option value="${escapeHtml(profile.id)}">
                ${escapeHtml(profile.name)}
            </option>
        `)
        .join("");

    const initialProfileId =
        shortcut?.profileId ??
        preferredProfileId ??
        (currentView.type === "profile"
            ? currentView.profileId
            : state.profiles[0].id);

    if (
        state.profiles.some(
            profile => profile.id === initialProfileId
        )
    ) {
        profileSelect.value = initialProfileId;
    }

    document.getElementById("shortcutModalTitle").textContent =
        shortcut ? "Edit Shortcut" : "Add Shortcut";

    document.getElementById("shortcutModalSubtitle").textContent =
        shortcut
            ? "Update this text replacement."
            : "Add a reusable text replacement.";

    document.getElementById("shortcutModalSave").textContent =
        shortcut ? "Save Changes" : "Add Shortcut";

    document.getElementById("shortcutKeyInput").value =
        shortcut?.key ?? "";

    document.getElementById("shortcutReplacementInput").value =
        shortcut?.replacement ?? "";

    document.getElementById("shortcutEnabledInput").checked =
        shortcut?.enabled ?? true;

    document.getElementById("shortcutModalError").textContent = "";

    document
        .getElementById("shortcutModal")
        .classList.remove("hidden");

    setTimeout(() => {
        const input = document.getElementById("shortcutKeyInput");
        input.focus();
        input.select();
    }, 0);
}


function closeShortcutModal() {
    editingShortcutId = null;

    document
        .getElementById("shortcutModal")
        .classList.add("hidden");
}


async function saveShortcutModal() {
    const profileId =
        document.getElementById("shortcutProfileInput").value;

    const key =
        document.getElementById("shortcutKeyInput").value.trim();

    const replacement =
        document.getElementById("shortcutReplacementInput").value;

    const enabled =
        document.getElementById("shortcutEnabledInput").checked;

    const error =
        document.getElementById("shortcutModalError");

    if (!profileId) {
        error.textContent = "Select a profile.";
        document.getElementById("shortcutProfileInput").focus();
        return;
    }

    if (!key) {
        error.textContent = "Shortcut key cannot be empty.";
        document.getElementById("shortcutKeyInput").focus();
        return;
    }

    if (!replacement.trim()) {
        error.textContent = "Replacement cannot be empty.";
        document.getElementById("shortcutReplacementInput").focus();
        return;
    }

    try {
        if (editingShortcutId) {
            await updateShortcut(
                editingShortcutId,
                {
                    profileId,
                    key,
                    replacement,
                    enabled
                }
            );
        } else {
            await createShortcut({
                profileId,
                key,
                replacement,
                enabled
            });
        }

        closeShortcutModal();
        await renderShortcuts();
    } catch (err) {
        error.textContent =
            err.message ||
            "Unable to save shortcut.";
    }
}


async function deleteShortcutFromDashboard(shortcut) {
    const profile = await getProfile(shortcut.profileId);
    const profileName = profile?.name ?? "this profile";

    const confirmed = confirm(
        `Delete the shortcut "${shortcut.key}" from "${profileName}"?`
    );

    if (!confirmed) {
        return;
    }

    try {
        await deleteShortcut(shortcut.id);
        await renderShortcuts();
    } catch (err) {
        alert(err.message || "Unable to delete shortcut.");
    }
}


async function toggleShortcut(shortcut, enabled) {
    try {
        await setShortcutEnabled(shortcut.id, enabled);
        await renderShortcuts();
    } catch (err) {
        alert(err.message || "Unable to update shortcut.");
        await renderShortcuts();
    }
}


/* ========================================
   Shortcut list
   ======================================== */

async function renderShortcuts() {
    const state = await getExtensionState();
    const body = document.getElementById("shortcutTableBody");
    const search = document
        .getElementById("searchInput")
        .value
        .trim()
        .toLowerCase();

    const profileMap = new Map(
        state.profiles.map(profile => [profile.id, profile])
    );

    currentShortcuts = state.shortcuts.filter(shortcut => {
        if (
            currentView.type === "profile" &&
            shortcut.profileId !== currentView.profileId
        ) {
            return false;
        }

        if (!search) {
            return true;
        }

        const profile = profileMap.get(shortcut.profileId);

        return [
            profile?.name,
            shortcut.key,
            shortcut.replacement
        ]
            .filter(Boolean)
            .some(value =>
                String(value)
                    .toLowerCase()
                    .includes(search)
            );
    });

    currentShortcuts.sort((a, b) =>
        a.key.localeCompare(b.key)
    );

    body.innerHTML = "";

    if (currentShortcuts.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 5;
        cell.className = "table-empty";
        cell.textContent =
            search
                ? "No shortcuts match your search."
                : currentView.type === "profile"
                    ? "No shortcuts in this profile."
                    : "No shortcuts yet.";

        row.appendChild(cell);
        body.appendChild(row);
        return;
    }

    for (const shortcut of currentShortcuts) {
        const profile = profileMap.get(shortcut.profileId);
        const row = document.createElement("tr");

        const profileCell = document.createElement("td");
        profileCell.textContent = profile?.name ?? "Unknown profile";

        const keyCell = document.createElement("td");
        keyCell.innerHTML =
            `<code class="shortcut-key">${escapeHtml(shortcut.key)}</code>`;

        const replacementCell = document.createElement("td");
        replacementCell.className = "replacement-cell";
        replacementCell.textContent = shortcut.replacement;
        replacementCell.title = shortcut.replacement;

        const enabledCell = document.createElement("td");
        const enabledLabel = document.createElement("label");
        enabledLabel.className = "switch switch-small";
        enabledLabel.title =
            shortcut.enabled
                ? "Disable shortcut"
                : "Enable shortcut";

        const enabledInput = document.createElement("input");
        enabledInput.type = "checkbox";
        enabledInput.checked = Boolean(shortcut.enabled);
        enabledInput.setAttribute(
            "aria-label",
            `${shortcut.enabled ? "Disable" : "Enable"} ${shortcut.key}`
        );

        const enabledSlider = document.createElement("span");
        enabledLabel.appendChild(enabledInput);
        enabledLabel.appendChild(enabledSlider);
        enabledCell.appendChild(enabledLabel);

        enabledInput.addEventListener("change", () =>
            toggleShortcut(shortcut, enabledInput.checked)
        );

        const actionsCell = document.createElement("td");
        actionsCell.className = "shortcut-actions";

        const editButton = document.createElement("button");
        editButton.type = "button";
        editButton.className = "table-icon-button";
        editButton.setAttribute("aria-label", `Edit ${shortcut.key}`);
        editButton.title = "Edit shortcut";
        editButton.innerHTML =
            `<span class="lt-icon">${LTIcons.edit}</span>`;
        editButton.addEventListener("click", () =>
            openShortcutModal(shortcut)
        );

        const deleteButton = document.createElement("button");
        deleteButton.type = "button";
        deleteButton.className = "table-icon-button danger";
        deleteButton.setAttribute(
            "aria-label",
            `Delete ${shortcut.key}`
        );
        deleteButton.title = "Delete shortcut";
        deleteButton.innerHTML =
            `<span class="lt-icon">${LTIcons.trash}</span>`;
        deleteButton.addEventListener("click", () =>
            deleteShortcutFromDashboard(shortcut)
        );

        actionsCell.appendChild(editButton);
        actionsCell.appendChild(deleteButton);

        row.appendChild(profileCell);
        row.appendChild(keyCell);
        row.appendChild(replacementCell);
        row.appendChild(enabledCell);
        row.appendChild(actionsCell);
        body.appendChild(row);
    }
}


/* ========================================
   Initial URL action
   ======================================== */

function handleInitialUrlAction() {
    const params = new URLSearchParams(window.location.search);

    if (params.get("action") !== "add-shortcut") {
        return;
    }

    const profileId = params.get("profileId");
    openShortcutModal(null, profileId);
}


/* ========================================
   Delete profile
   ======================================== */

async function confirmDeleteProfile(profile) {
    const state = await getExtensionState();

    const shortcutCount =
        state.shortcuts.filter(
            shortcut => shortcut.profileId === profile.id
        ).length;

    const message =
        shortcutCount > 0
            ? `Delete "${profile.name}"?\n\nThis will also delete ${shortcutCount} shortcut${shortcutCount === 1 ? "" : "s"} in this profile.`
            : `Delete "${profile.name}"?\n\nThis profile has no shortcuts.`;

    if (!confirm(message)) {
        return;
    }

    try {
        await deleteProfile(profile.id);

        if (currentView.profileId === profile.id) {
            currentView = {
                type: "all",
                profileId: null
            };
        }

        await renderProfiles();
        await renderShortcuts();
        renderPageTitle();
    } catch (err) {
        alert(err.message || "Unable to delete profile.");
    }
}


/* ========================================
   Export
   ======================================== */

async function exportProfileCsv(profile) {
    const state = await getExtensionState();

    const shortcuts = state.shortcuts.filter(
        shortcut => shortcut.profileId === profile.id
    );

    const rows = [
        [
            "Profile",
            "Shortcut",
            "Replacement",
            "Enabled"
        ]
    ];

    for (const shortcut of shortcuts) {
        rows.push([
            profile.name,
            shortcut.key,
            shortcut.replacement,
            shortcut.enabled ? "true" : "false"
        ]);
    }

    const csv = rows
        .map(row =>
            row
                .map(csvEscape)
                .join(",")
        )
        .join("\r\n");

    downloadTextFile(
        `${safeFilename(profile.name)}.csv`,
        csv,
        "text/csv;charset=utf-8"
    );
}


function csvEscape(value) {
    const string = String(value ?? "");

    if (/[",\r\n]/.test(string)) {
        return `"${string.replaceAll('"', '""')}"`;
    }

    return string;
}


function downloadTextFile(filename, content, type) {
    const blob = new Blob(
        [content],
        { type }
    );

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    anchor.click();

    setTimeout(
        () => URL.revokeObjectURL(url),
        1000
    );
}


function safeFilename(name) {
    return name
        .replace(/[<>:"/\\|?*]/g, "_")
        .trim() || "profile";
}


/* ========================================
   Page
   ======================================== */

function renderPageTitle() {
    const title = document.querySelector(
        ".dashboard-header h1"
    );

    if (currentView.type === "all") {
        title.textContent = "All Shortcuts";
        return;
    }

    getProfile(currentView.profileId).then(profile => {
        title.textContent = profile?.name ?? "Profile";
    });
}


/* ========================================
   Helpers
   ======================================== */

function escapeHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
