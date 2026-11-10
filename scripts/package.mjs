import { build, Platform, Arch } from "electron-builder";
import { cpSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
const version = JSON.parse(readFileSync("package.json", "utf8")).version;
for (const role of ["server", "station"]) {
  const dir = resolve(".data/package-" + role);
  mkdirSync(dir, { recursive: true });
  cpSync("dist/web", dir + "/dist/web", { recursive: true });
  mkdirSync(dir + "/dist/desktop", { recursive: true });
  cpSync("dist/desktop/" + role + ".cjs", dir + "/dist/desktop/main.cjs");
  cpSync("dist/desktop/preload.cjs", dir + "/dist/desktop/preload.cjs");
  const product = role === "server" ? "PC Club Server" : "PC Club Station";
  const installer = resolve(".data/installer-" + role + ".nsi");
  const script = readFileSync("scripts/installer.nsi", "utf8")
    .replaceAll("@PRODUCT@", product)
    .replaceAll("@ROLE@", role)
    .replaceAll("@VERSION@", version)
    .replaceAll("@SOURCE@", resolve("release/" + role + "/win-unpacked"))
    .replaceAll("@ICON@", resolve("build/icon.ico"));
  writeFileSync(installer, script);
  writeFileSync(
    dir + "/package.json",
    JSON.stringify({
      name: "pc-club-" + role,
      version,
      main: "dist/desktop/main.cjs",
      description: "School Festival PC Cafe " + role,
      author: "PC Club",
      private: true,
    }),
  );
  await build({
    targets: Platform.WINDOWS.createTarget(["nsis"], Arch.x64),
    config: {
      appId: "school.pcclub." + role,
      productName: product,
      electronVersion: JSON.parse(
        readFileSync("node_modules/electron/package.json", "utf8"),
      ).version,
      asar: true,
      compression: "store",
      directories: { app: dir, output: resolve("release/" + role) },
      files: ["dist/**/*", "package.json"],
      npmRebuild: false,
      win: {
        signAndEditExecutable: false,
        artifactName: "PC-Club-" + role + "-${version}-${arch}.${ext}",
      },
      nsis: {
        script: installer,
        installerLanguages: ["ko_KR", "en_US"],
        oneClick: false,
        perMachine: false,
        allowToChangeInstallationDirectory: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        shortcutName: product,
        artifactName: "PC-Club-" + role + "-Setup-${version}-${arch}.${ext}",
        deleteAppDataOnUninstall: false,
      },
      electronDownload: { cache: resolve(".data/electron-cache") },
    },
  });
}
