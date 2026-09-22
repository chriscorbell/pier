// Fallback signing for builds without a Developer ID certificate (local `pnpm dist`, or CI before
// the signing secrets exist). Without any signature macOS 15 reports a downloaded copy as
// "damaged"; an ad-hoc signature turns that into the "unverified developer" prompt with an Open
// Anyway path. When a certificate is configured, electron-builder signs and notarizes after this
// hook, so the ad-hoc pass is skipped.
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  if (process.env.CSC_LINK || process.env.CSC_NAME) return;
  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = join(context.appOutDir, appName);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", "--timestamp=none", appPath], { stdio: "inherit" });
  execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], { stdio: "inherit" });
};
