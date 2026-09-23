importScripts(
    "../shared/constants.js",
    "../storage/defaults.js",
    "../storage/storage.js"
);

const LOG_PREFIX = "[LessType][worker]";

function log(...args) {
    console.log(LOG_PREFIX, ...args);
}

function warn(...args) {
    console.warn(LOG_PREFIX, ...args);
}

function error(...args) {
    console.error(LOG_PREFIX, ...args);
}


// ============================================================
// State
// ============================================================

async function getState() {
    const state = await getExtensionState();

    log("STATE READ", state);

    return state;
}


// ============================================================
// Installation / startup
// ============================================================

chrome.runtime.onInstalled.addListener(
    async (details) => {
        log(
            "EXTENSION INSTALLED / UPDATED",
            details
        );

        try {
            await initializeExtensionState();

            log(
                "EXTENSION STATE INITIALIZED"
            );

            await clearContextMenus();
        } catch (err) {
            error(
                "INSTALLATION FAILED",
                err
            );
        }
    }
);


chrome.runtime.onStartup.addListener(
    async () => {
        log("BROWSER STARTUP");

        try {
            await clearContextMenus();
        } catch (err) {
            error(
                "STARTUP FAILED",
                err
            );
        }
    }
);


// ============================================================
// IMPORTANT
//
// We DO NOT create profile menus when the extension starts.
//
// The LessType context menu exists ONLY when the content
// script detects an ambiguous shortcut.
//
// Example:
//
// Selected profile: utnam
//
// age exists in:
//     Profile2 -> 22
//     Profile3  -> 23
//
// Then we create:
//
// LessType: "age"
//     Profile2 -> 22
//     Profile3  -> 23
//
// ============================================================


// ============================================================
// Clear menus
// ============================================================

async function clearContextMenus() {
    try {
        await chrome.contextMenus.removeAll();

        log(
            "CONTEXT MENUS CLEARED"
        );
    } catch (err) {
        error(
            "FAILED TO CLEAR CONTEXT MENUS",
            err
        );
    }
}


// ============================================================
// Show ambiguity menu
// ============================================================

async function showContextMenus(
    tabId,
    shortcutKey,
    profiles
) {
    log(
        "SHOW CONTEXT MENU",
        {
            tabId,
            shortcutKey,
            profiles
        }
    );

    await clearContextMenus();


    // --------------------------------------------------------
    // Root menu
    // --------------------------------------------------------

    chrome.contextMenus.create({
        id: "lesstype-root",

        title:
            `LessType: "${shortcutKey}"`,

        contexts: [
            "editable"
        ]
    });

    log(
        "AMBIGUITY ROOT CREATED"
    );


    // --------------------------------------------------------
    // Profile choices
    // --------------------------------------------------------

    for (const candidate of profiles) {

        /*
         * Candidate is expected to contain:
         *
         * {
         *     profile: {
         *         id,
         *         name
         *     },
         *
         *     shortcut: {
         *         key,
         *         replacement
         *     }
         * }
         *
         * We also support the flatter structure so this
         * remains compatible with the existing content.js.
         */

        const profile =
            candidate?.profile ??
            candidate;

        const shortcut =
            candidate?.shortcut ??
            candidate;


        const profileId =
            profile?.id ??
            candidate?.profileId;


        if (!profileId) {
            warn(
                "AMBIGUOUS PROFILE HAS NO ID",
                candidate
            );

            continue;
        }


        const profileName =
            String(
                profile?.name ??
                candidate?.profileName ??
                profileId
            );


        // ----------------------------------------------------
        // IMPORTANT:
        //
        // Get the replacement belonging to THIS profile's
        // matching shortcut.
        // ----------------------------------------------------

        const replacement =
            String(
                candidate?.replacement ??
                shortcut?.replacement ??
                candidate?.value ??
                shortcut?.value ??
                ""
            );


        /*
         * BEFORE:
         *
         *     title: profile.name
         *
         * Which produced:
         *
         *     Profile2
         *     Profile3
         *
         *
         * NOW:
         *
         *     Profile2 → 22
         *     Profile3 → testage
         */

        const title =
            replacement
                ? `${profileName} → ${replacement}`
                : profileName;


        const menuId =
            `lesstype-profile:${profileId}`;


        chrome.contextMenus.create({
            id: menuId,

            parentId:
                "lesstype-root",

            title,

            contexts: [
                "editable"
            ]
        });


        log(
            "AMBIGUITY PROFILE MENU CREATED",
            {
                menuId,
                profileId,
                profileName,
                replacement,
                title
            }
        );
    }


    log(
        "AMBIGUITY MENU READY"
    );
}


// ============================================================
// Context menu click
// ============================================================

chrome.contextMenus.onClicked.addListener(
    async (info, tab) => {

        log(
            "CONTEXT MENU CLICK",
            {
                info,
                tabId: tab?.id,
                url: tab?.url
            }
        );


        if (!tab?.id) {
            warn(
                "CONTEXT CLICK HAS NO TAB"
            );

            return;
        }


        const menuId =
            String(
                info.menuItemId
            );


        if (
            !menuId.startsWith(
                "lesstype-profile:"
            )
        ) {
            return;
        }


        const profileId =
            menuId.slice(
                "lesstype-profile:".length
            );


        log(
            "PROFILE CHOSEN FROM CONTEXT MENU",
            {
                profileId
            }
        );


        try {

            /*
             * The content script already knows:
             *
             * - which shortcut was typed
             * - where it is in the input
             * - which profiles were candidates
             *
             * We only send the selected profile ID back.
             */

            const response =
                await chrome.tabs.sendMessage(
                    tab.id,
                    {
                        type:
                            "LESSTYPE_CONTEXT_PROFILE_SELECTED",

                        profileId
                    }
                );


            log(
                "PROFILE SELECTION SENT TO CONTENT SCRIPT",
                response
            );

        } catch (err) {

            error(
                "FAILED TO SEND PROFILE SELECTION",
                err
            );

        }


        // Remove the temporary ambiguity menu.
        await clearContextMenus();
    }
);


// ============================================================
// Runtime messages
// ============================================================

chrome.runtime.onMessage.addListener(
    (
        message,
        sender,
        sendResponse
    ) => {

        log(
            "RUNTIME MESSAGE",
            {
                message,
                sender
            }
        );


        // ----------------------------------------------------
        // Content script says:
        //
        // "I found a shortcut that exists in multiple
        // non-selected profiles."
        // ----------------------------------------------------

        if (
            message?.type ===
            "LESSTYPE_SHOW_CONTEXT_MENU"
        ) {

            const tabId =
                sender.tab?.id;


            if (!tabId) {

                error(
                    "SHOW CONTEXT MENU HAS NO TAB ID"
                );


                sendResponse({
                    ok: false,

                    error:
                        "No tab id"
                });


                return true;
            }


            const profiles =
                Array.isArray(
                    message.profiles
                )
                    ? message.profiles
                    : [];


            if (
                profiles.length < 2
            ) {

                warn(
                    "REFUSING TO CREATE CONTEXT MENU FOR LESS THAN 2 PROFILES",
                    profiles
                );


                sendResponse({
                    ok: false
                });


                return true;
            }


            showContextMenus(
                tabId,

                message.shortcutKey,

                profiles
            )
                .then(() => {

                    sendResponse({
                        ok: true
                    });

                })
                .catch((err) => {

                    error(
                        "SHOW CONTEXT MENU FAILED",
                        err
                    );


                    sendResponse({
                        ok: false,

                        error:
                            err?.message ||
                            String(err)
                    });

                });


            return true;
        }


        // ----------------------------------------------------
        // Shortcut was resolved immediately.
        //
        // Remove any stale ambiguity menu.
        // ----------------------------------------------------

        if (
            message?.type ===
            "LESSTYPE_CLEAR_CONTEXT_MENU"
        ) {

            clearContextMenus()
                .then(() => {

                    sendResponse({
                        ok: true
                    });

                })
                .catch((err) => {

                    sendResponse({
                        ok: false,

                        error:
                            err?.message ||
                            String(err)
                    });

                });


            return true;
        }


        // ----------------------------------------------------
        // Debug ping
        // ----------------------------------------------------

        if (
            message?.type ===
            "LESSTYPE_DEBUG_PING"
        ) {

            sendResponse({
                ok: true,

                from:
                    "service-worker",

                timestamp:
                    Date.now()
            });


            return true;
        }


        return false;
    }
);


// ============================================================
// Debug API
// ============================================================

self.__LESSTYPE_DEBUG__ = {
    getState,
    clearContextMenus,
    showContextMenus
};


log(
    "SERVICE WORKER INITIALIZATION COMPLETE"
);
