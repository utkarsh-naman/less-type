// async function getExtensionState() {
//     const defaults = createDefaultState();

//     const stored = await chrome.storage.local.get([
//         LESSTYPE.STORAGE_KEYS.PROFILES,
//         LESSTYPE.STORAGE_KEYS.SHORTCUTS,
//         LESSTYPE.STORAGE_KEYS.SETTINGS
//     ]);

//     return {
//         profiles: stored.profiles ?? defaults.profiles,
//         shortcuts: stored.shortcuts ?? defaults.shortcuts,
//         settings: {
//             ...defaults.settings,
//             ...(stored.settings ?? {})
//         }
//     };
// }


// async function saveExtensionState(state) {
//     await chrome.storage.local.set({
//         [LESSTYPE.STORAGE_KEYS.PROFILES]: state.profiles,
//         [LESSTYPE.STORAGE_KEYS.SHORTCUTS]: state.shortcuts,
//         [LESSTYPE.STORAGE_KEYS.SETTINGS]: state.settings
//     });
// }


// async function initializeExtensionState() {
//     const existing = await chrome.storage.local.get([
//         LESSTYPE.STORAGE_KEYS.PROFILES,
//         LESSTYPE.STORAGE_KEYS.SHORTCUTS,
//         LESSTYPE.STORAGE_KEYS.SETTINGS
//     ]);

//     const hasState =
//         existing.profiles !== undefined ||
//         existing.shortcuts !== undefined ||
//         existing.settings !== undefined;

//     if (!hasState) {
//         await saveExtensionState(createDefaultState());
//     }
// }


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