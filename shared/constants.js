const LESSTYPE = Object.freeze({
    NAME: "LessType",
    VERSION: "0.1.0",

    DEFAULT_TRIGGER: "/:",

    STORAGE_KEYS: Object.freeze({
        PROFILES: "profiles",
        SHORTCUTS: "shortcuts",
        SETTINGS: "settings"
    }),

    DEFAULT_SETTINGS: Object.freeze({
        trigger: "/:",
        requireDelimiter: true,
        immediateExpansion: false,
        profileNameCaseSensitive: false,
        incognitoEnabled: false,
        globalEnabled: true,
        activeProfileId: null,
        siteRules: []
    })
});