// Playwright forces a basic password store in its loader. Restore the real
// libsecret backend for this Linux integration test; production is unchanged.
const { app } = require("electron");
app.commandLine.appendSwitch("password-store", "gnome-libsecret");
app.commandLine.removeSwitch("use-mock-keychain");
require(process.env.CAFE_TEST_ENTRY);
