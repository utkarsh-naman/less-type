// document.addEventListener("DOMContentLoaded", async () => {
//     await initializeExtensionState();

//     const settingsButton =
//         document.getElementById("settingsButton");

//     settingsButton.addEventListener("click", () => {
//         chrome.runtime.openOptionsPage();
//     });
// });

let currentView = {
    type: "all",
    profileId: null
};


document.addEventListener("DOMContentLoaded", async () => {

    await initializeExtensionState();

    setupStaticIcons();
    setupNavigation();
    setupProfileModal();

    await renderProfiles();

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
}


/* ========================================
   Navigation
   ======================================== */

function setupNavigation() {

    document
        .getElementById("allShortcutsButton")
        .addEventListener(
            "click",
            async () => {

                currentView = {
                    type: "all",
                    profileId: null
                };

                await renderProfiles();
                renderPageTitle();

            }
        );


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

}


/* ========================================
   Profiles
   ======================================== */

async function renderProfiles() {

    const state =
        await getExtensionState();

    const list =
        document.getElementById("profileList");

    list.innerHTML = "";


    for (const profile of state.profiles) {

        const row =
            document.createElement("div");

        row.className =
            "profile-row";


        if (
            currentView.type === "profile" &&
            currentView.profileId === profile.id
        ) {
            row.classList.add("active");
        }


        const button =
            document.createElement("button");

        button.type = "button";
        button.className = "sidebar-item";

        button.innerHTML =
            `<span>${escapeHtml(profile.name)}</span>`;


        button.addEventListener(
            "click",
            async () => {

                currentView = {
                    type: "profile",
                    profileId: profile.id
                };

                await renderProfiles();
                renderPageTitle();

            }
        );


        const menuButton =
            document.createElement("button");

        menuButton.type = "button";
        menuButton.className =
            "profile-menu-button";

        menuButton.setAttribute(
            "aria-label",
            `Options for ${profile.name}`
        );

        menuButton.innerHTML =
            `<span class="lt-icon">${LTIcons.more}</span>`;


        menuButton.addEventListener(
            "click",
            event => {

                event.stopPropagation();

                openProfileMenu(
                    profile,
                    menuButton
                );

            }
        );


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


    const menu =
        document.createElement("div");

    menu.className =
        "profile-menu";


    const rename =
        createMenuItem(
            LTIcons.edit,
            "Rename"
        );

    rename.addEventListener(
        "click",
        () => {

            closeProfileMenus();

            openProfileModal(profile);

        }
    );


    const exportProfile =
        createMenuItem(
            LTIcons.download,
            "Export profile"
        );

    exportProfile.addEventListener(
        "click",
        async () => {

            closeProfileMenus();

            await exportProfileCsv(profile);

        }
    );


    const deleteProfileButton =
        createMenuItem(
            LTIcons.trash,
            "Delete profile",
            true
        );

    deleteProfileButton.addEventListener(
        "click",
        async () => {

            closeProfileMenus();

            await confirmDeleteProfile(profile);

        }
    );


    menu.appendChild(rename);
    menu.appendChild(exportProfile);
    menu.appendChild(deleteProfileButton);

    document.body.appendChild(menu);


    const rect =
        anchor.getBoundingClientRect();


    menu.style.top =
        `${rect.bottom + 4}px`;

    menu.style.left =
        `${Math.max(
            8,
            rect.right - menu.offsetWidth
        )}px`;


    setTimeout(() => {

        document.addEventListener(
            "click",
            closeProfileMenus,
            {
                once: true
            }
        );

    });

}


function createMenuItem(
    icon,
    label,
    danger = false
) {

    const button =
        document.createElement("button");

    if (danger) {
        button.classList.add("danger");
    }

    button.innerHTML = `
        <span class="lt-icon">
            ${icon}
        </span>

        <span>
            ${label}
        </span>
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

let editingProfileId = null;


function setupProfileModal() {

    const modal =
        document.getElementById("profileModal");


    document
        .getElementById("profileModalClose")
        .addEventListener(
            "click",
            closeProfileModal
        );


    document
        .getElementById("profileModalCancel")
        .addEventListener(
            "click",
            closeProfileModal
        );


    document
        .getElementById("profileModalSave")
        .addEventListener(
            "click",
            saveProfileModal
        );


    document
        .getElementById("profileNameInput")
        .addEventListener(
            "keydown",
            event => {

                if (event.key === "Enter") {
                    saveProfileModal();
                }

                if (event.key === "Escape") {
                    closeProfileModal();
                }

            }
        );


    modal.addEventListener(
        "click",
        event => {

            if (
                event.target === modal
            ) {
                closeProfileModal();
            }

        }
    );
}


function openProfileModal(profile = null) {

    editingProfileId =
        profile?.id ?? null;


    document
        .getElementById("profileModalTitle")
        .textContent =
            profile
                ? "Rename Profile"
                : "New Profile";


    document
        .getElementById("profileModalSave")
        .textContent =
            profile
                ? "Save Changes"
                : "Create Profile";


    document
        .getElementById("profileNameInput")
        .value =
            profile?.name ?? "";


    document
        .getElementById("profileModalError")
        .textContent = "";


    document
        .getElementById("profileModal")
        .classList.remove("hidden");


    setTimeout(() => {

        const input =
            document.getElementById(
                "profileNameInput"
            );

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


// async function saveProfileModal() {

//     const input =
//         document.getElementById(
//             "profileNameInput"
//         );

//     const error =
//         document.getElementById(
//             "profileModalError"
//         );


//     const name =
//         input.value.trim();


//     if (!name) {

//         error.textContent =
//             "Profile name cannot be empty.";

//         input.focus();

//         return;
//     }


//     try {

//         let profile;


//         if (editingProfileId) {

//             profile =
//                 await renameProfile(
//                     editingProfileId,
//                     name
//                 );

//         } else {

//             profile =
//                 await createProfile(name);

//         }


//         closeProfileModal();

//         await renderProfiles();


//         if (!editingProfileId) {

//             currentView = {
//                 type: "profile",
//                 profileId: profile.id
//             };

//             await renderProfiles();
//             renderPageTitle();

//         }


//     } catch (err) {

//         error.textContent =
//             err.message ||
//             "Unable to save profile.";

//     }
// }

async function saveProfileModal() {

    const input =
        document.getElementById(
            "profileNameInput"
        );

    const error =
        document.getElementById(
            "profileModalError"
        );

    const name =
        input.value.trim();


    if (!name) {
        error.textContent =
            "Profile name cannot be empty.";

        input.focus();

        return;
    }


    const isCreating =
        !editingProfileId;


    try {

        let profile;


        if (isCreating) {

            profile =
                await createProfile(name);

        } else {

            profile =
                await renameProfile(
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

        renderPageTitle();


    } catch (err) {

        error.textContent =
            err.message ||
            "Unable to save profile.";

    }
}

/* ========================================
   Delete
   ======================================== */

async function confirmDeleteProfile(profile) {

    const state =
        await getExtensionState();

    const shortcutCount =
        state.shortcuts.filter(
            shortcut =>
                shortcut.profileId === profile.id
        ).length;


    const message =
        shortcutCount > 0

            ? `Delete "${profile.name}"?\n\nThis will also delete ${shortcutCount} shortcut${shortcutCount === 1 ? "" : "s"} in this profile.`

            : `Delete "${profile.name}"?\n\nThis profile has no shortcuts.`;


    if (!confirm(message)) {
        return;
    }


    await deleteProfile(profile.id);


    if (
        currentView.profileId === profile.id
    ) {

        currentView = {
            type: "all",
            profileId: null
        };

    }


    await renderProfiles();
    renderPageTitle();
}


/* ========================================
   Export
   ======================================== */

async function exportProfileCsv(profile) {

    const state =
        await getExtensionState();


    const shortcuts =
        state.shortcuts.filter(
            shortcut =>
                shortcut.profileId === profile.id
        );


    const rows = [
        [
            "Profile",
            "Shortcut",
            "Replacement"
        ]
    ];


    for (const shortcut of shortcuts) {

        rows.push([
            profile.name,
            shortcut.key,
            shortcut.replacement
        ]);

    }


    const csv =
        rows
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

    const string =
        String(value ?? "");


    if (
        /[",\r\n]/.test(string)
    ) {

        return `"${string.replaceAll(
            '"',
            '""'
        )}"`;

    }


    return string;
}


function downloadTextFile(
    filename,
    content,
    type
) {

    const blob =
        new Blob(
            [content],
            { type }
        );


    const url =
        URL.createObjectURL(blob);


    const anchor =
        document.createElement("a");

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

    const title =
        document.querySelector(
            ".dashboard-header h1"
        );


    if (
        currentView.type === "all"
    ) {

        title.textContent =
            "All Shortcuts";

        return;
    }


    getProfile(
        currentView.profileId
    ).then(profile => {

        title.textContent =
            profile?.name ??
            "Profile";

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