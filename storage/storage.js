async function getExtensionState() {
    const defaults = createDefaultState();

    const stored = await chrome.storage.local.get([
        LESSTYPE.STORAGE_KEYS.PROFILES,
        LESSTYPE.STORAGE_KEYS.SHORTCUTS,
        LESSTYPE.STORAGE_KEYS.SETTINGS
    ]);

    return {
        profiles: stored.profiles ?? defaults.profiles,
        shortcuts: stored.shortcuts ?? defaults.shortcuts,
        settings: {
            ...defaults.settings,
            ...(stored.settings ?? {})
        }
    };
}


async function saveExtensionState(state) {
    await chrome.storage.local.set({
        [LESSTYPE.STORAGE_KEYS.PROFILES]: state.profiles,
        [LESSTYPE.STORAGE_KEYS.SHORTCUTS]: state.shortcuts,
        [LESSTYPE.STORAGE_KEYS.SETTINGS]: state.settings
    });
}


async function initializeExtensionState() {
    const state = await chrome.storage.local.get([
        LESSTYPE.STORAGE_KEYS.PROFILES,
        LESSTYPE.STORAGE_KEYS.SHORTCUTS,
        LESSTYPE.STORAGE_KEYS.SETTINGS
    ]);

    const hasState =
        state.profiles !== undefined ||
        state.shortcuts !== undefined ||
        state.settings !== undefined;

    if (!hasState) {
        await saveExtensionState(createDefaultState());
    }
}


/* ========================================
   Profiles
   ======================================== */

function normalizeProfileName(name, caseSensitive) {
    const trimmed = name.trim();

    return caseSensitive
        ? trimmed
        : trimmed.toLowerCase();
}


function profileNameExists(
    profiles,
    name,
    caseSensitive,
    excludeId = null
) {
    const normalized =
        normalizeProfileName(name, caseSensitive);

    return profiles.some(profile => {
        if (profile.id === excludeId) {
            return false;
        }

        return normalizeProfileName(
            profile.name,
            caseSensitive
        ) === normalized;
    });
}


async function createProfile(name) {
    const state = await getExtensionState();

    const trimmedName = name.trim();

    if (!trimmedName) {
        throw new Error("Profile name cannot be empty.");
    }

    if (
        profileNameExists(
            state.profiles,
            trimmedName,
            state.settings.profileNameCaseSensitive
        )
    ) {
        throw new Error(
            "A profile with this name already exists."
        );
    }

    const now = Date.now();

    const profile = {
        id: crypto.randomUUID(),
        name: trimmedName,
        createdAt: now,
        updatedAt: now
    };

    state.profiles.push(profile);

    await saveExtensionState(state);

    return profile;
}


async function renameProfile(profileId, newName) {
    const state = await getExtensionState();

    const profile =
        state.profiles.find(
            item => item.id === profileId
        );

    if (!profile) {
        throw new Error("Profile not found.");
    }

    const trimmedName = newName.trim();

    if (!trimmedName) {
        throw new Error("Profile name cannot be empty.");
    }

    if (
        profileNameExists(
            state.profiles,
            trimmedName,
            state.settings.profileNameCaseSensitive,
            profileId
        )
    ) {
        throw new Error(
            "A profile with this name already exists."
        );
    }

    profile.name = trimmedName;
    profile.updatedAt = Date.now();

    await saveExtensionState(state);

    return profile;
}


async function deleteProfile(profileId) {
    const state = await getExtensionState();

    const profile =
        state.profiles.find(
            item => item.id === profileId
        );

    if (!profile) {
        throw new Error("Profile not found.");
    }

    state.profiles =
        state.profiles.filter(
            item => item.id !== profileId
        );

    state.shortcuts =
        state.shortcuts.filter(
            item => item.profileId !== profileId
        );

    await saveExtensionState(state);
}


async function getProfile(profileId) {
    const state = await getExtensionState();

    return (
        state.profiles.find(
            profile => profile.id === profileId
        ) ?? null
    );
}


/* ========================================
   Shortcuts
   ======================================== */

function normalizeShortcutKey(key) {
    return key.trim();
}


function shortcutKeyExists(
    shortcuts,
    profileId,
    key,
    excludeId = null
) {
    const normalizedKey = normalizeShortcutKey(key);

    return shortcuts.some(shortcut => {
        if (shortcut.id === excludeId) {
            return false;
        }

        return (
            shortcut.profileId === profileId &&
            normalizeShortcutKey(shortcut.key) === normalizedKey
        );
    });
}


function validateShortcutKey(key) {
    const trimmedKey = normalizeShortcutKey(key);

    if (!trimmedKey) {
        throw new Error("Shortcut key cannot be empty.");
    }

    if (/\r|\n/.test(trimmedKey)) {
        throw new Error("Shortcut key must be a single line.");
    }

    return trimmedKey;
}


function validateShortcutReplacement(replacement) {
    const value = String(replacement ?? "");

    if (!value.trim()) {
        throw new Error("Replacement cannot be empty.");
    }

    return value;
}


async function createShortcut({
    profileId,
    key,
    replacement,
    enabled = true
}) {
    const state = await getExtensionState();

    const profile =
        state.profiles.find(
            item => item.id === profileId
        );

    if (!profile) {
        throw new Error("Profile not found.");
    }

    const normalizedKey = validateShortcutKey(key);
    const normalizedReplacement =
        validateShortcutReplacement(replacement);

    if (
        shortcutKeyExists(
            state.shortcuts,
            profileId,
            normalizedKey
        )
    ) {
        throw new Error(
            `The shortcut "${normalizedKey}" already exists in this profile.`
        );
    }

    const now = Date.now();

    const shortcut = {
        id: crypto.randomUUID(),
        profileId,
        key: normalizedKey,
        replacement: normalizedReplacement,
        enabled: Boolean(enabled),
        createdAt: now,
        updatedAt: now
    };

    state.shortcuts.push(shortcut);

    await saveExtensionState(state);

    return shortcut;
}


async function updateShortcut(shortcutId, updates) {
    const state = await getExtensionState();

    const shortcut =
        state.shortcuts.find(
            item => item.id === shortcutId
        );

    if (!shortcut) {
        throw new Error("Shortcut not found.");
    }

    const nextProfileId =
        updates.profileId ?? shortcut.profileId;

    const nextProfile =
        state.profiles.find(
            profile => profile.id === nextProfileId
        );

    if (!nextProfile) {
        throw new Error("Profile not found.");
    }

    const nextKey =
        validateShortcutKey(
            updates.key ?? shortcut.key
        );

    const nextReplacement =
        validateShortcutReplacement(
            updates.replacement ?? shortcut.replacement
        );

    if (
        shortcutKeyExists(
            state.shortcuts,
            nextProfileId,
            nextKey,
            shortcutId
        )
    ) {
        throw new Error(
            `The shortcut "${nextKey}" already exists in this profile.`
        );
    }

    shortcut.profileId = nextProfileId;
    shortcut.key = nextKey;
    shortcut.replacement = nextReplacement;

    if (updates.enabled !== undefined) {
        shortcut.enabled = Boolean(updates.enabled);
    }

    shortcut.updatedAt = Date.now();

    await saveExtensionState(state);

    return shortcut;
}


async function deleteShortcut(shortcutId) {
    const state = await getExtensionState();

    const exists =
        state.shortcuts.some(
            shortcut => shortcut.id === shortcutId
        );

    if (!exists) {
        throw new Error("Shortcut not found.");
    }

    state.shortcuts =
        state.shortcuts.filter(
            shortcut => shortcut.id !== shortcutId
        );

    await saveExtensionState(state);
}


async function setShortcutEnabled(shortcutId, enabled) {
    const state = await getExtensionState();

    const shortcut =
        state.shortcuts.find(
            item => item.id === shortcutId
        );

    if (!shortcut) {
        throw new Error("Shortcut not found.");
    }

    shortcut.enabled = Boolean(enabled);
    shortcut.updatedAt = Date.now();

    await saveExtensionState(state);

    return shortcut;
}


async function getShortcut(shortcutId) {
    const state = await getExtensionState();

    return (
        state.shortcuts.find(
            shortcut => shortcut.id === shortcutId
        ) ?? null
    );
}
