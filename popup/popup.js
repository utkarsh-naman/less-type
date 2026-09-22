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
            () => {

                chrome.tabs.create({
                    url: chrome.runtime.getURL(
                        "dashboard/dashboard.html"
                    )
                });

            }
        );

});