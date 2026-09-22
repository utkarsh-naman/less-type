function createDefaultState() {
    return {
        profiles: [],
        shortcuts: [],
        settings: {
            ...LESSTYPE.DEFAULT_SETTINGS,
            siteRules: []
        }
    };
}