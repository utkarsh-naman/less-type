let selectedProfileId = null;


document.addEventListener("DOMContentLoaded", async () => {
    await initializeExtensionState();

    document.getElementById("settingsIcon").innerHTML =
        LTIcons.settings;

    document.getElementById("searchIcon").innerHTML =
        LTIcons.search;

    document.getElementById("profileSelectorIcon").innerHTML =
        LTIcons.chevronDown;

    document
        .getElementById("settingsButton")
        .addEventListener(
            "click",
            () => chrome.runtime.openOptionsPage()
        );

    document
        .getElementById("openDashboardButton")
        .addEventListener(
            "click",
            () => openDashboard()
        );

    document
        .getElementById("addShortcutButton")
        .addEventListener(
            "click",
            () => openDashboard(true)
        );

    document
        .getElementById("profileSelector")
        .addEventListener(
            "click",
            toggleProfileDropdown
        );

    document
        .getElementById("shortcutSearch")
        .addEventListener(
            "input",
            () => renderPopup()
        );

    document.addEventListener("click", event => {
        const selector = document.getElementById("profileSelector");
        const dropdown = document.getElementById("profileDropdown");

        if (
            dropdown.classList.contains("hidden") ||
            selector.contains(event.target) ||
            dropdown.contains(event.target)
        ) {
            return;
        }

        closeProfileDropdown();
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeProfileDropdown();
        }
    });

    await renderPopup();
});


async function renderPopup() {
    const state = await getExtensionState();

    if (
        !selectedProfileId ||
        !state.profiles.some(profile => profile.id === selectedProfileId)
    ) {
        selectedProfileId = state.profiles[0]?.id ?? null;
    }

    const selectedProfile = state.profiles.find(
        profile => profile.id === selectedProfileId
    ) ?? null;

    document.querySelector("#profileSelector span:first-child")
        .textContent = selectedProfile?.name ?? "No profiles";

    renderProfileDropdown(state.profiles);

    const list = document.getElementById("shortcutList");
    const count = document.getElementById("shortcutCount");
    const search = document.getElementById("shortcutSearch");
    const query = search.value.trim().toLowerCase();

    list.innerHTML = "";

    const profileShortcuts = selectedProfile
        ? state.shortcuts.filter(
            shortcut => shortcut.profileId === selectedProfile.id
        )
        : [];

    const shortcuts = profileShortcuts.filter(shortcut => {
        if (!query) {
            return true;
        }

        return (
            shortcut.key.toLowerCase().includes(query) ||
            shortcut.replacement.toLowerCase().includes(query)
        );
    });

    count.textContent =
        `${profileShortcuts.length} shortcut${profileShortcuts.length === 1 ? "" : "s"}`;

    if (shortcuts.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = selectedProfile
            ? (
                query
                    ? "No matching shortcuts."
                    : "No shortcuts in this profile yet."
            )
            : "Create a profile to add shortcuts.";
        list.appendChild(empty);
        return;
    }

    for (const shortcut of shortcuts.slice(0, 6)) {
        const item = document.createElement("div");
        item.className = "shortcut-item";

        const key = document.createElement("code");
        key.textContent = shortcut.key;

        const replacement = document.createElement("span");
        replacement.textContent = shortcut.replacement.replace(/\s+/g, " ");

        item.appendChild(key);
        item.appendChild(replacement);

        if (!shortcut.enabled) {
            item.classList.add("disabled");
        }

        list.appendChild(item);
    }

    if (shortcuts.length > 6) {
        const more = document.createElement("div");
        more.className = "shortcut-more";
        more.textContent = `+ ${shortcuts.length - 6} more`;
        list.appendChild(more);
    }
}


function renderProfileDropdown(profiles) {
    const dropdown = document.getElementById("profileDropdown");
    dropdown.innerHTML = "";

    if (profiles.length === 0) {
        const empty = document.createElement("div");
        empty.className = "profile-dropdown-empty";
        empty.textContent = "No profiles yet.";
        dropdown.appendChild(empty);
        return;
    }

    for (const profile of profiles) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "profile-option";

        if (profile.id === selectedProfileId) {
            button.classList.add("selected");
        }

        const name = document.createElement("span");
        name.textContent = profile.name;

        button.appendChild(name);

        button.addEventListener("click", async () => {
            selectedProfileId = profile.id;
            closeProfileDropdown();

            const search = document.getElementById("shortcutSearch");
            search.value = "";

            await renderPopup();
        });

        dropdown.appendChild(button);
    }
}


function toggleProfileDropdown(event) {
    event.stopPropagation();

    const dropdown = document.getElementById("profileDropdown");
    const isOpen = dropdown.classList.toggle("hidden") === false;

    document
        .getElementById("profileSelector")
        .setAttribute("aria-expanded", String(isOpen));
}


function closeProfileDropdown() {
    document
        .getElementById("profileDropdown")
        .classList.add("hidden");

    document
        .getElementById("profileSelector")
        .setAttribute("aria-expanded", "false");
}


function openDashboard(openShortcutModal = false) {
    const url = new URL(
        chrome.runtime.getURL("dashboard/dashboard.html")
    );

    if (openShortcutModal) {
        url.searchParams.set("action", "add-shortcut");
    }

    chrome.tabs.create({
        url: url.toString()
    });
}
