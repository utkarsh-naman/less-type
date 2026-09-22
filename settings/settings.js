document.addEventListener("DOMContentLoaded", async () => {

    await initializeExtensionState();

    await loadSettings();

    setupSettingsListeners();

});


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


    const caseRadio =
        document.querySelector(
            `input[name="profileCase"][value="${state.settings.profileNameCaseSensitive}"]`
        );

    if (caseRadio) {
        caseRadio.checked = true;
    }
}


function setupSettingsListeners() {

    document
        .getElementById("globalEnabled")
        .addEventListener(
            "change",
            saveSettings
        );

    document
        .getElementById("trigger")
        .addEventListener(
            "change",
            saveSettings
        );

    document
        .getElementById("requireDelimiter")
        .addEventListener(
            "change",
            saveSettings
        );

    document
        .getElementById("immediateExpansion")
        .addEventListener(
            "change",
            saveSettings
        );

    document
        .getElementById("incognitoEnabled")
        .addEventListener(
            "change",
            saveSettings
        );


    document
        .querySelectorAll(
            'input[name="profileCase"]'
        )
        .forEach(input => {

            input.addEventListener(
                "change",
                handleProfileCaseChange
            );

        });
}


async function saveSettings() {

    const state =
        await getExtensionState();

    const trigger =
        document
            .getElementById("trigger")
            .value
            .trim();


    if (!trigger) {

        alert(
            "Trigger cannot be empty."
        );

        await loadSettings();

        return;
    }


    state.settings.globalEnabled =
        document
            .getElementById("globalEnabled")
            .checked;

    state.settings.trigger =
        trigger;

    state.settings.requireDelimiter =
        document
            .getElementById("requireDelimiter")
            .checked;

    state.settings.immediateExpansion =
        document
            .getElementById("immediateExpansion")
            .checked;

    state.settings.incognitoEnabled =
        document
            .getElementById("incognitoEnabled")
            .checked;


    await saveExtensionState(state);
}


async function handleProfileCaseChange(event) {

    const newValue =
        event.target.value === "true";

    const state =
        await getExtensionState();


    if (
        state.settings.profileNameCaseSensitive ===
        newValue
    ) {
        return;
    }


    if (!newValue) {

        const seen =
            new Set();

        const conflicts = [];


        for (const profile of state.profiles) {

            const normalized =
                profile.name.trim().toLowerCase();

            if (seen.has(normalized)) {

                conflicts.push(
                    profile.name
                );

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


    state.settings.profileNameCaseSensitive =
        newValue;

    await saveExtensionState(state);
}