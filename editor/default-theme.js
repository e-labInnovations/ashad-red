// Default the editor theme to "System" (auto) instead of Node-RED's built-in "light".
// Only seeds the value when the user has never picked one, so their choice still wins.
(function () {
    try {
        if (localStorage.getItem("view-dark-theme") === null) {
            localStorage.setItem("view-dark-theme", "auto");
        }
    } catch (err) {}
})();
