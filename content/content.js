(() => {
    "use strict";

    const LOG_PREFIX = "[LessType][content]";
    const DEFAULT_TRIGGER = "/:";

    const DEFAULT_SETTINGS = {
        trigger: DEFAULT_TRIGGER,
        requireDelimiter: true,
        immediateExpansion: false,
        profileNameCaseSensitive: false,
        incognitoEnabled: false,
        globalEnabled: true,
    };

    const DELIMITERS = new Set([
        " ",
        "\t",
        "\n",
        "\r",
        ",",
        ".",
        ";",
        ":",
        "!",
        "?",
        ")",
        "]",
        "}",
        "(",
        "[",
        "{",
        "<",
        ">",
        "'",
        '"',
        "`",
        "-",
        "_",
    ]);

    let state = null;
    let stateLoadPromise = null;

    // When there are multiple non-selected profile matches,
    // the content script remembers the ambiguity here.
    let pendingAmbiguousShortcut = null;

    let ignoreNextInput = false;
    let compositionActive = false;

    // ------------------------------------------------------------
    // Logging
    // ------------------------------------------------------------

    function log(...args) {
        console.log(LOG_PREFIX, ...args);
    }

    function warn(...args) {
        console.warn(LOG_PREFIX, ...args);
    }

    function error(...args) {
        console.error(LOG_PREFIX, ...args);
    }

    // ------------------------------------------------------------
    // Extension context safety
    // ------------------------------------------------------------

    // A content-script instance can outlive an extension reload/update.
    // Once that happens, its chrome.* extension APIs are no longer usable.
    function isExtensionContextValid() {
        try {
            return Boolean(chrome?.runtime?.id);
        } catch {
            return false;
        }
    }

    function isExtensionContextInvalidated(err) {
        return String(err?.message || err || "")
            .toLowerCase()
            .includes("extension context invalidated");
    }

    async function sendRuntimeMessage(message) {
        if (!isExtensionContextValid()) {
            return null;
        }

        try {
            return await chrome.runtime.sendMessage(message);
        } catch (err) {
            // This is expected when an old content-script instance is still
            // running after the extension has been reloaded/updated. There
            // is nothing useful for this stale instance to do, so fail quiet.
            if (isExtensionContextInvalidated(err)) {
                return null;
            }

            throw err;
        }
    }

    // ------------------------------------------------------------
    // Initialization
    // ------------------------------------------------------------

    init();

    function init() {
        log("CONTENT SCRIPT LOADED", {
            url: location.href,
            title: document.title,
        });

        void getState();

        document.addEventListener(
            "compositionstart",
            () => {
                compositionActive = true;
            },
            true
        );

        document.addEventListener(
            "compositionend",
            () => {
                compositionActive = false;
                scheduleExpansionCheck();
            },
            true
        );

        document.addEventListener(
            "input",
            handleInput,
            true
        );

        document.addEventListener(
            "keydown",
            handleKeydown,
            true
        );

        chrome.storage.onChanged.addListener(
            (changes, areaName) => {
                if (areaName !== "local") {
                    return;
                }

                if (
                    changes.profiles ||
                    changes.shortcuts ||
                    changes.settings
                ) {
                    log(
                        "STORAGE CHANGED - INVALIDATING STATE"
                    );

                    state = null;

                    // Any previous ambiguity is now potentially stale.
                    pendingAmbiguousShortcut = null;

                    void getState();
                }
            }
        );
    }

    // ------------------------------------------------------------
    // State
    // ------------------------------------------------------------

    async function getState() {
        if (state) {
            return state;
        }

        if (!stateLoadPromise) {
            log("READING STATE");

            stateLoadPromise =
                chrome.storage.local
                    .get([
                        "profiles",
                        "shortcuts",
                        "settings",
                    ])
                    .then((stored) => {
                        state = {
                            profiles: Array.isArray(
                                stored.profiles
                            )
                                ? stored.profiles
                                : [],

                            shortcuts: Array.isArray(
                                stored.shortcuts
                            )
                                ? stored.shortcuts
                                : [],

                            settings: {
                                ...DEFAULT_SETTINGS,
                                ...(stored.settings || {}),
                            },
                        };

                        log("STATE READ", {
                            profiles:
                                state.profiles,
                            shortcuts:
                                state.shortcuts,
                            settings:
                                state.settings,
                        });

                        return state;
                    })
                    .catch((err) => {
                        error(
                            "STATE READ FAILED",
                            err
                        );

                        throw err;
                    })
                    .finally(() => {
                        stateLoadPromise = null;
                    });
        }

        return stateLoadPromise;
    }

    function getSettings(currentState) {
        return {
            ...DEFAULT_SETTINGS,
            ...(currentState?.settings || {}),
        };
    }

    // ------------------------------------------------------------
    // Editable elements
    // ------------------------------------------------------------

    function isTextControl(element) {
        return (
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement
        );
    }

    function isEditable(element) {
        if (!element) {
            return false;
        }

        if (isTextControl(element)) {
            if (
                element.disabled ||
                element.readOnly
            ) {
                return false;
            }

            if (
                element instanceof HTMLInputElement
            ) {
                return [
                    "text",
                    "search",
                    "url",
                    "email",
                    "tel",
                    "password",
                    "number",
                ].includes(element.type);
            }

            return true;
        }

        return Boolean(
            element.isContentEditable
        );
    }

    function getEditableTarget(target) {
        if (!target) {
            return null;
        }

        if (isTextControl(target)) {
            return target;
        }

        if (target.isContentEditable) {
            return target;
        }

        return (
            target.closest?.(
                '[contenteditable="true"]'
            ) || null
        );
    }

    // ------------------------------------------------------------
    // Selection
    // ------------------------------------------------------------

    function readSelection(target) {
        if (isTextControl(target)) {
            const start = target.selectionStart;
            const end = target.selectionEnd;

            if (
                start === null ||
                end === null
            ) {
                return null;
            }

            return {
                start,
                end,
                textBeforeCaret:
                    target.value.slice(
                        0,
                        start
                    ),
                range: null,
            };
        }

        if (!target.isContentEditable) {
            return null;
        }

        const selection =
            window.getSelection();

        if (
            !selection ||
            selection.rangeCount === 0 ||
            !selection.isCollapsed
        ) {
            return null;
        }

        const range =
            selection.getRangeAt(0);

        if (
            !target.contains(
                range.startContainer
            )
        ) {
            return null;
        }

        const beforeRange =
            range.cloneRange();

        beforeRange.selectNodeContents(
            target
        );

        beforeRange.setEnd(
            range.startContainer,
            range.startOffset
        );

        const text =
            beforeRange.toString();

        return {
            start: text.length,
            end: text.length,
            textBeforeCaret: text,
            range: range.cloneRange(),
        };
    }

    // ------------------------------------------------------------
    // Active / selected profile
    // ------------------------------------------------------------

    function getActiveProfileId(
        currentState
    ) {
        const configured =
            currentState.settings
                ?.activeProfileId;

        if (
            configured &&
            currentState.profiles.some(
                (profile) =>
                    profile.id ===
                    configured
            )
        ) {
            return configured;
        }

        // Backwards-compatible fallback.
        return (
            currentState.profiles[0]?.id ??
            null
        );
    }

    function getActiveProfile(
        currentState
    ) {
        const id =
            getActiveProfileId(
                currentState
            );

        return (
            currentState.profiles.find(
                (profile) =>
                    profile.id === id
            ) || null
        );
    }

    // ------------------------------------------------------------
    // Shortcut matching
    // ------------------------------------------------------------

    function getMatchesForShortcut(
        currentState,
        shortcutKey
    ) {
        const matches =
            currentState.shortcuts
                .filter(
                    (shortcut) =>
                        shortcut.enabled !== false
                )
                .filter(
                    (shortcut) =>
                        String(
                            shortcut.key
                        ) ===
                        String(shortcutKey)
                )
                .map((shortcut) => {
                    const profile =
                        currentState.profiles.find(
                            (profile) =>
                                profile.id ===
                                shortcut.profileId
                        );

                    return {
                        shortcut,
                        profile,
                    };
                })
                .filter(
                    (match) =>
                        Boolean(match.profile)
                );

        log(
            "SHORTCUT PROFILE MATCHES",
            {
                shortcutKey,
                matches,
            }
        );

        return matches;
    }

    function getUniqueProfileMatches(
        matches
    ) {
        const seen =
            new Set();

        return matches.filter(
            (match) => {
                if (
                    seen.has(
                        match.profile.id
                    )
                ) {
                    return false;
                }

                seen.add(
                    match.profile.id
                );

                return true;
            }
        );
    }

    // ------------------------------------------------------------
    // Candidate detection
    // ------------------------------------------------------------

    function findCandidate(
        textBeforeCaret,
        trigger,
        settings,
        delimiterKey = ""
    ) {
        const triggerIndex =
            textBeforeCaret.lastIndexOf(
                trigger
            );

        if (triggerIndex === -1) {
            return null;
        }

        let afterTrigger =
            textBeforeCaret.slice(
                triggerIndex +
                    trigger.length
            );

        if (!afterTrigger) {
            return null;
        }

        let delimiter = "";

        if (
            !settings.immediateExpansion &&
            settings.requireDelimiter
        ) {
            const lastChar =
                afterTrigger.slice(-1);

            if (
                DELIMITERS.has(lastChar)
            ) {
                delimiter = lastChar;

                afterTrigger =
                    afterTrigger.slice(
                        0,
                        -1
                    );
            } else if (delimiterKey) {
                delimiter = delimiterKey;
            } else {
                return null;
            }
        }

        if (
            !afterTrigger ||
            /\s/.test(afterTrigger)
        ) {
            return null;
        }

        return {
            shortcut: afterTrigger,
            triggerIndex,
            delimiter,
        };
    }

    // ------------------------------------------------------------
    // Core profile decision
    // ------------------------------------------------------------

    function resolveShortcut(
        currentState,
        shortcutKey
    ) {
        const activeProfileId =
            getActiveProfileId(
                currentState
            );

        const activeProfile =
            getActiveProfile(
                currentState
            );

        const matches =
            getMatchesForShortcut(
                currentState,
                shortcutKey
            );

        const activeMatch =
            matches.find(
                (match) =>
                    match.profile.id ===
                    activeProfileId
            );

        // --------------------------------------------------------
        // RULE 1:
        // Selected profile has the shortcut.
        // Replace immediately.
        // --------------------------------------------------------

        if (activeMatch) {
            log(
                "RULE 1: ACTIVE PROFILE MATCH",
                {
                    activeProfile,
                    match: activeMatch,
                }
            );

            return {
                action: "replace",
                match: activeMatch,
                activeProfileId,
            };
        }

        // --------------------------------------------------------
        // Selected profile doesn't have it.
        // Look only at NON-selected profiles.
        // --------------------------------------------------------

        const otherMatches =
            getUniqueProfileMatches(
                matches.filter(
                    (match) =>
                        match.profile.id !==
                        activeProfileId
                )
            );

        // --------------------------------------------------------
        // RULE 2:
        // Exactly one other profile has it.
        // Replace immediately.
        // --------------------------------------------------------

        if (
            otherMatches.length === 1
        ) {
            log(
                "RULE 2: EXACTLY ONE NON-ACTIVE PROFILE MATCH",
                {
                    activeProfile,
                    match: otherMatches[0],
                }
            );

            return {
                action: "replace",
                match: otherMatches[0],
                activeProfileId,
            };
        }

        // --------------------------------------------------------
        // RULE 3:
        // More than one other profile has it.
        // Do NOT replace.
        // Show context menu.
        // --------------------------------------------------------

        if (
            otherMatches.length > 1
        ) {
            log(
                "RULE 3: MULTIPLE NON-ACTIVE PROFILE MATCHES",
                {
                    activeProfile,
                    matches:
                        otherMatches,
                }
            );

            return {
                action: "context",
                matches: otherMatches,
                activeProfileId,
            };
        }

        // No matching shortcut.
        log(
            "NO PROFILE CONTAINS SHORTCUT",
            {
                shortcutKey,
                activeProfile,
            }
        );

        return {
            action: "none",
            activeProfileId,
        };
    }

    // ------------------------------------------------------------
    // Replacement
    // ------------------------------------------------------------

    function replaceCandidate(
        target,
        candidate,
        selection,
        replacement
    ) {
        const replacementText =
            String(replacement ?? "");

        const start =
            candidate.triggerIndex;

        const end =
            selection.start;

        log(
            "REPLACING",
            {
                shortcut:
                    candidate.shortcut,
                start,
                end,
                replacement:
                    replacementText,
            }
        );

        if (isTextControl(target)) {
            target.focus();

            target.setSelectionRange(
                start,
                end
            );

            target.setRangeText(
                replacementText,
                start,
                end,
                "end"
            );

            dispatchInput(
                target,
                replacementText
            );

            return true;
        }

        if (
            target.isContentEditable &&
            selection.range
        ) {
            const range =
                selection.range.cloneRange();

            range.deleteContents();

            const node =
                document.createTextNode(
                    replacementText
                );

            range.insertNode(node);

            range.setStartAfter(node);
            range.collapse(true);

            const sel =
                window.getSelection();

            sel.removeAllRanges();
            sel.addRange(range);

            dispatchInput(
                target,
                replacementText
            );

            return true;
        }

        return false;
    }

    function dispatchInput(
        target,
        data
    ) {
        ignoreNextInput = true;

        try {
            target.dispatchEvent(
                new InputEvent(
                    "input",
                    {
                        bubbles: true,
                        inputType:
                            "insertText",
                        data,
                    }
                )
            );
        } catch {
            target.dispatchEvent(
                new Event(
                    "input",
                    {
                        bubbles: true,
                    }
                )
            );
        }
    }

    // ------------------------------------------------------------
    // Expansion
    // ------------------------------------------------------------

    async function checkForExpansion(
        targetOverride = null,
        delimiterKey = ""
    ) {
        // A stale content script must stop before touching chrome.* APIs.
        if (!isExtensionContextValid()) {
            return;
        }

        const target =
            targetOverride ||
            getEditableTarget(
                document.activeElement
            );

        if (
            !target ||
            !isEditable(target)
        ) {
            return;
        }

        const currentState =
            await getState();

        const settings =
            getSettings(
                currentState
            );

        if (!settings.globalEnabled) {
            log(
                "GLOBAL EXPANSION DISABLED"
            );

            return;
        }

        if (
            settings.incognitoEnabled ===
                false &&
            isIncognitoLikePage()
        ) {
            return;
        }

        const selection =
            readSelection(target);

        if (
            !selection ||
            selection.start !==
                selection.end
        ) {
            return;
        }

        const textBeforeCaret =
            selection.textBeforeCaret;

        const trigger =
            String(
                settings.trigger ||
                    DEFAULT_TRIGGER
            );

        const candidate =
            findCandidate(
                textBeforeCaret,
                trigger,
                settings,
                delimiterKey
            );

        if (!candidate) {
            return;
        }

        log(
            "CANDIDATE FOUND",
            candidate
        );

        const decision =
            resolveShortcut(
                currentState,
                candidate.shortcut
            );

        // --------------------------------------------------------
        // Immediate replacement
        // --------------------------------------------------------

        if (
            decision.action ===
            "replace"
        ) {
            pendingAmbiguousShortcut =
                null;

            // Remove any stale context menu.
            try {
                await sendRuntimeMessage({
                    type:
                        "LESSTYPE_CLEAR_CONTEXT_MENU",
                });
            } catch (err) {
                warn(
                    "Could not clear context menu",
                    err
                );
            }

            replaceCandidate(
                target,
                candidate,
                selection,
                decision.match.shortcut
                    .replacement
            );

            log(
                "REPLACED IMMEDIATELY",
                {
                    profile:
                        decision.match
                            .profile.name,
                    shortcut:
                        candidate.shortcut,
                    replacement:
                        decision.match
                            .shortcut
                            .replacement,
                }
            );

            return;
        }

        // --------------------------------------------------------
        // Multiple non-active profiles.
        // --------------------------------------------------------

        if (
            decision.action ===
            "context"
        ) {
            pendingAmbiguousShortcut = {
                target,
                candidate,
                selection: cloneSelection(
                    selection
                ),
                shortcutKey:
                    candidate.shortcut,
                matches:
                    decision.matches,
            };

            log(
                "AMBIGUOUS SHORTCUT - WAITING FOR PROFILE",
                pendingAmbiguousShortcut
            );

            try {
                await sendRuntimeMessage({
                    type:
                        "LESSTYPE_SHOW_CONTEXT_MENU",

                    shortcutKey:
                        candidate.shortcut,

                    profiles:
                        decision.matches.map(
                                (match) => ({
                                    id:
                                        match
                                            .profile
                                            .id,

                                    name:
                                        match
                                            .profile
                                            .name,

                                    replacement:
                                        match
                                            .shortcut
                                            .replacement,
                                })
                            ),
                    }
                );
            } catch (err) {
                error(
                    "FAILED TO SHOW CONTEXT MENU",
                    err
                );
            }
        }
    }

    // ------------------------------------------------------------
    // Context-menu profile selection
    // ------------------------------------------------------------

    chrome.runtime.onMessage.addListener(
        (
            message,
            sender,
            sendResponse
        ) => {
            log(
                "RUNTIME MESSAGE",
                message
            );

            if (
                message?.type ===
                "LESSTYPE_CONTEXT_PROFILE_SELECTED"
            ) {
                void handleContextProfileSelected(
                    message
                );

                sendResponse({
                    ok: true,
                });

                return true;
            }

            if (
                message?.type ===
                "LESSTYPE_DEBUG_GET_STATE"
            ) {
                sendResponse({
                    ok: true,
                    state,
                });

                return true;
            }

            return false;
        }
    );

    async function handleContextProfileSelected(
        message
    ) {
        const pending =
            pendingAmbiguousShortcut;

        if (!pending) {
            warn(
                "CONTEXT PROFILE SELECTED BUT NO PENDING SHORTCUT"
            );

            return;
        }

        const target =
            pending.target;

        if (
            !target ||
            !isEditable(target)
        ) {
            warn(
                "PENDING TARGET IS NO LONGER EDITABLE"
            );

            pendingAmbiguousShortcut =
                null;

            return;
        }

        const selectedMatch =
            pending.matches.find(
                (match) =>
                    String(
                        match.profile.id
                    ) ===
                    String(
                        message.profileId
                    )
            );

        if (!selectedMatch) {
            error(
                "SELECTED PROFILE NOT IN PENDING MATCHES",
                {
                    profileId:
                        message.profileId,
                    matches:
                        pending.matches,
                }
            );

            return;
        }

        const currentSelection =
            readSelection(target);

        if (!currentSelection) {
            pendingAmbiguousShortcut =
                null;

            return;
        }

        replaceCandidate(
            target,
            pending.candidate,
            pending.selection,
            selectedMatch.shortcut
                .replacement
        );

        log(
            "REPLACED FROM CONTEXT MENU",
            {
                profile:
                    selectedMatch
                        .profile
                        .name,
                shortcut:
                    pending.shortcutKey,
                replacement:
                    selectedMatch
                        .shortcut
                        .replacement,
            }
        );

        pendingAmbiguousShortcut =
            null;
    }

    // ------------------------------------------------------------
    // Keyboard handling
    // ------------------------------------------------------------

    function handleInput(event) {
        if (
            ignoreNextInput ||
            compositionActive
        ) {
            ignoreNextInput = false;
            return;
        }

        const target =
            getEditableTarget(
                event.target
            );

        if (!target) {
            return;
        }

        scheduleExpansionCheck(
            target
        );
    }

    function handleKeydown(event) {
        if (
            compositionActive ||
            event.isComposing
        ) {
            return;
        }

        const target =
            getEditableTarget(
                event.target
            );

        if (!target) {
            return;
        }

        if (
            event.ctrlKey ||
            event.metaKey ||
            event.altKey
        ) {
            return;
        }

        if (
            !isDelimiterKey(event)
        ) {
            return;
        }

        // If immediateExpansion is enabled,
        // don't wait for a delimiter.
        //
        // The input event path will already have
        // handled the shortcut.
        const currentSettings =
            getSettings(state);

        if (
            currentSettings
                .immediateExpansion
        ) {
            return;
        }

        if (
            isTextControl(target) &&
            state
        ) {
            const start =
                target.selectionStart;

            const end =
                target.selectionEnd;

            if (
                start !== null &&
                end !== null &&
                start === end
            ) {
                const settings =
                    getSettings(
                        state
                    );

                if (
                    settings.globalEnabled &&
                    !(
                        settings
                            .incognitoEnabled ===
                            false &&
                        isIncognitoLikePage()
                    )
                ) {
                    const trigger =
                        String(
                            settings.trigger ||
                                DEFAULT_TRIGGER
                        );

                    const textBefore =
                        target.value.slice(
                            0,
                            start
                        );

                    const candidate =
                        findCandidate(
                            textBefore,
                            trigger,
                            settings,
                            event.key
                        );

                    if (candidate) {
                        const decision =
                            resolveShortcut(
                                state,
                                candidate.shortcut
                            );

                        if (
                            decision.action ===
                            "replace"
                        ) {
                            event.preventDefault();
                            event.stopPropagation();

                            pendingAmbiguousShortcut =
                                null;

                            replaceCandidate(
                                target,
                                candidate,
                                {
                                    start,
                                    end,
                                    textBeforeCaret:
                                        textBefore,
                                    range: null,
                                },
                                decision.match
                                    .shortcut
                                    .replacement
                            );

                            void clearContextMenu();

                            return;
                        }

                        if (
                            decision.action ===
                            "context"
                        ) {
                            // Don't allow the delimiter to
                            // destroy the shortcut while the
                            // user chooses a profile.
                            event.preventDefault();
                            event.stopPropagation();

                            pendingAmbiguousShortcut =
                                {
                                    target,
                                    candidate,
                                    selection: {
                                        start,
                                        end,
                                        textBeforeCaret:
                                            textBefore,
                                        range: null,
                                    },
                                    shortcutKey:
                                        candidate.shortcut,
                                    matches:
                                        decision.matches,
                                };

                            void showContextMenu(
                                candidate.shortcut,
                                decision.matches
                            );

                            return;
                        }
                    }
                }
            }
        }

        // Normal fallback.
        window.setTimeout(
            () => {
                void checkForExpansion(
                    target,
                    event.key
                );
            },
            0
        );
    }

    function scheduleExpansionCheck(
        target
    ) {
        window.setTimeout(
            () => {
                void checkForExpansion(
                    target
                );
            },
            0
        );
    }

    // ------------------------------------------------------------
    // Context-menu communication
    // ------------------------------------------------------------

    async function showContextMenu(
        shortcutKey,
        matches
    ) {
        try {
            await sendRuntimeMessage({
                type:
                    "LESSTYPE_SHOW_CONTEXT_MENU",

                shortcutKey,

                profiles:
                    matches.map(
                        (match) => ({
                            id:
                                match
                                    .profile
                                    .id,

                            name:
                                match
                                    .profile
                                    .name,

                            replacement:
                                match
                                    .shortcut
                                    .replacement,
                        })
                    ),
            });
        } catch (err) {
            error(
                "SHOW CONTEXT MENU FAILED",
                err
            );
        }
    }

    async function clearContextMenu() {
        try {
            await sendRuntimeMessage({
                type:
                    "LESSTYPE_CLEAR_CONTEXT_MENU",
            });
        } catch {
            // Ignore non-critical cleanup failures.
        }
    }

    // ------------------------------------------------------------
    // Helpers
    // ------------------------------------------------------------

    function isDelimiterKey(event) {
        if (
            event.key === "Tab" ||
            event.key === "Enter"
        ) {
            return true;
        }

        return (
            typeof event.key ===
                "string" &&
            event.key.length === 1 &&
            DELIMITERS.has(event.key)
        );
    }

    function isIncognitoLikePage() {
        return Boolean(
            chrome.extension
                ?.inIncognitoContext
        );
    }

    function cloneSelection(
        selection
    ) {
        return {
            start: selection.start,
            end: selection.end,
            textBeforeCaret:
                selection.textBeforeCaret,
            range: selection.range
                ? selection.range.cloneRange()
                : null,
        };
    }

    // ------------------------------------------------------------
    // Debug API
    // ------------------------------------------------------------

    window.__LESSTYPE_DEBUG__ = {
        getState,
        resolveShortcut,
        checkForExpansion,
        isEditable,
        readSelection,
    };

    log(
        "INITIALIZATION COMPLETE"
    );
})();
