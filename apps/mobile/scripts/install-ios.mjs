// Export the Mac library into the app, build a signed Release, and install it on the USB-connected iPhone.
// Usage: npm run ios:install
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });

// 1. data
run(process.execPath, ["scripts/bundle-library.mjs"]);

// 2. native project
if (!existsSync(join(root, "ios"))) run("npx", ["expo", "prebuild", "--platform", "ios"]);

// 3. find the iPhone
const tmp = mkdtempSync(join(tmpdir(), "abn-"));
const listFile = join(tmp, "devices.json");
execFileSync("xcrun", ["devicectl", "list", "devices", "--json-output", listFile], { stdio: "ignore" });
const devices = JSON.parse(readFileSync(listFile, "utf8")).result.devices;
rmSync(tmp, { recursive: true, force: true });
const phone = devices.find(
  (d) => d.hardwareProperties?.platform === "iOS" && d.hardwareProperties?.reality === "physical" && d.connectionProperties?.tunnelState !== "unavailable",
);
if (!phone) {
  console.error("✗ No iPhone found. Plug it in, unlock it, and trust this Mac.");
  process.exit(1);
}
const udid = phone.hardwareProperties.udid;
console.log(`→ Building for ${phone.deviceProperties?.name ?? udid}`);

// 4. build + sign (free Personal Team is set via ios.appleTeamId in app.json)
const derived = join(root, "ios/build/dd");
run("xcodebuild", [
  "-workspace", "ios/BookNotes.xcworkspace", "-scheme", "BookNotes", "-configuration", "Release",
  "-destination", `id=${udid}`, "-derivedDataPath", derived, "-allowProvisioningUpdates", "-quiet", "build",
]);

// 5. install + open
const app = join(derived, "Build/Products/Release-iphoneos/BookNotes.app");
run("xcrun", ["devicectl", "device", "install", "app", "--device", udid, app]);
run("xcrun", ["devicectl", "device", "process", "launch", "--device", udid, "com.eduardsimonyan.booknotes"]);
console.log("✓ Installed. Book Notes is open on your iPhone.");
