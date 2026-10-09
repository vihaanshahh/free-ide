export const OPENCODE_VERSION = "1.18.27";
export const CODE_SERVER_VERSION = "4.141.0";

/** Archives produced by `pnpm package`. Asset names match the upstream release files. */
export const PACKAGE_TARGETS = [
  {
    id: "darwin-arm64",
    os: "darwin",
    arch: "arm64",
    codeServerArch: "macos-arm64",
    opencodeAsset: "opencode-darwin-arm64.zip",
  },
  {
    id: "darwin-x64",
    os: "darwin",
    arch: "x64",
    codeServerArch: "macos-amd64",
    opencodeAsset: "opencode-darwin-x64.zip",
  },
  {
    id: "linux-x64",
    os: "linux",
    arch: "x64",
    codeServerArch: "linux-amd64",
    opencodeAsset: "opencode-linux-x64.tar.gz",
  },
];

export function targetFor(platform = process.platform, arch = process.arch) {
  const hit = PACKAGE_TARGETS.find((item) => item.os === platform && item.arch === arch);
  if (!hit) {
    throw new Error(`No subspaces.si opencode build for ${platform}-${arch}. Use darwin-arm64, darwin-x64, or linux-x64.`);
  }
  return hit;
}

export function opencodeReleaseUrl(asset) {
  return `https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/${asset}`;
}

export function codeServerReleaseUrl(archName) {
  return `https://github.com/coder/code-server/releases/download/v${CODE_SERVER_VERSION}/code-server-${CODE_SERVER_VERSION}-${archName}.tar.gz`;
}
