from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import json

root = Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'manifest.json').read_text())
out = root / 'dist' / ('Yius-tab-' + manifest['version'] + '.zip')
out.parent.mkdir(exist_ok=True)
files = [root / name for name in ['manifest.json', 'background.js', 'theme-observer.html', 'theme-observer.js', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'PRIVACY.md', 'ARCHITECTURE.md', 'UI_SPEC.md']]
for folder in ['core', 'ui', 'sync', 'newtab', 'options', 'icon', '_locales']:
    files.extend(p for p in (root / folder).rglob('*') if p.is_file() and not p.name.startswith('.'))
with ZipFile(out, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(files):
        archive.write(path, path.relative_to(root))
with ZipFile(out) as archive:
    assert archive.testzip() is None
print(out)
