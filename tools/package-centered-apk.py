from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import subprocess

base = Path('publish/LX-N-X-Music-v1.2.0-foldable-layout-fix-arm64-v8a.apk')
bundle = Path('android/app/build/generated/assets/react/release/index.android.bundle')
unsigned = Path('publish/.pad-controls-centered-unsigned.apk')
aligned = Path('publish/.pad-controls-centered-aligned.apk')
output = Path('publish/LX-N-X-Music-v1.2.0-pad-controls-centered-arm64-v8a.apk')
tools = Path(r'C:\AndroidDev\android-sdk\build-tools\36.0.0')
if not base.is_file() or not bundle.is_file():
    raise SystemExit('Required APK or release JS bundle is missing')

with ZipFile(base, 'r') as src, ZipFile(unsigned, 'w', ZIP_DEFLATED, compresslevel=6) as dst:
    found = False
    for info in src.infolist():
        if info.filename == 'assets/index.android.bundle':
            dst.writestr(info, bundle.read_bytes())
            found = True
        elif not (info.filename.startswith('META-INF/') and info.filename.upper().endswith(('.RSA', '.DSA', '.EC', '.SF', 'MANIFEST.MF'))):
            dst.writestr(info, src.read(info.filename))
    if not found:
        raise SystemExit('Base APK has no React Native JS bundle')

print(f'Prepared bundle: {bundle.stat().st_size} bytes')
print(f'Unsigned APK: {unsigned.stat().st_size} bytes')

subprocess.run([str(tools / 'zipalign.exe'), '-f', '-p', '4', str(unsigned), str(aligned)], check=True)
subprocess.run([
    str(tools / 'apksigner.bat'), 'sign', '--ks', 'android/app/debug.keystore',
    '--ks-key-alias', 'androiddebugkey', '--ks-pass', 'pass:android',
    '--key-pass', 'pass:android', '--out', str(output), str(aligned),
], check=True)
subprocess.run([str(tools / 'zipalign.exe'), '-c', '-p', '4', str(output)], check=True)
subprocess.run([str(tools / 'apksigner.bat'), 'verify', '--verbose', str(output)], check=True)

with ZipFile(output) as apk:
    names = apk.namelist()
    has_lib = 'lib/arm64-v8a/libquickbase64.so' in names
    bundle_size = len(apk.read('assets/index.android.bundle'))
    if not has_lib or bundle_size != bundle.stat().st_size:
        raise SystemExit(f'APK validation failed: arm64_lib={has_lib}, bundle_size={bundle_size}')
    print(f'arm64 native library present: {has_lib}')
    print(f'APK bundle bytes: {bundle_size}')

unsigned.unlink()
aligned.unlink()
