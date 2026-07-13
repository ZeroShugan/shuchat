// afterPack hook: stamp the packaged Windows exe metadata with rcedit so Task
// Manager / file properties show "ShuChat" instead of "Electron".
//
// We do this ourselves because electron-builder's built-in exe editing needs to
// extract winCodeSign, whose macOS dylib *symlinks* fail to unpack on Windows
// without Developer Mode / admin (SeCreateSymbolicLinkPrivilege). So the build
// runs with signAndEditExecutable:false and we run the (cached) rcedit here on
// the packed exe, before the NSIS installer bundles it.
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const rcedit = path.join(__dirname, 'tools', 'rcedit-x64.exe');
  if (!fs.existsSync(rcedit)) {
    console.warn('[afterPack] rcedit not found, skipping exe metadata edit');
    return;
  }

  const version = context.packager.appInfo.version;
  const exe = path.join(context.appOutDir, 'ShuChat.exe');
  if (!fs.existsSync(exe)) {
    console.warn('[afterPack] ShuChat.exe not found at', exe);
    return;
  }

  const args = [
    exe,
    '--set-version-string', 'ProductName', 'ShuChat',
    '--set-version-string', 'FileDescription', 'ShuChat',
    '--set-version-string', 'CompanyName', 'Shugan',
    '--set-version-string', 'LegalCopyright', `Copyright © ${new Date().getFullYear()} Shugan`,
    '--set-version-string', 'InternalName', 'ShuChat',
    '--set-version-string', 'OriginalFilename', 'ShuChat.exe',
    '--set-file-version', version,
    '--set-product-version', version,
  ];
  try {
    execFileSync(rcedit, args, { stdio: 'inherit' });
    console.log('[afterPack] stamped ShuChat.exe metadata (v' + version + ')');
  } catch (e) {
    console.warn('[afterPack] rcedit failed:', e.message);
  }
};
