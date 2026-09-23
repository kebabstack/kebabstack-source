import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('public_source', ROOT / 'tools/public-source.py')
public = importlib.util.module_from_spec(spec)
spec.loader.exec_module(public)


class PublicSource(unittest.TestCase):
    def test_public_repository_must_not_silently_omit_new_private_files(self):
        self.write('.kebab-public-source.json', '{}')
        self.write('.env', 'PRIVATE_CONFIGURATION=example')
        self.commit()
        report, _ = public.audit(self.repo)
        self.assertIn('private-file-in-public-tree', {f['rule'] for f in report['findings']})

    def test_crumbs_requires_portable_configuration(self):
        good = b'const BACKEND_CANISTER_ID = "__BACKEND_CANISTER_ID__"; const HUB_URL = "__HUB_URL__";'
        self.assertEqual(public.findings_for('crumbs/dist/app.js', good, []), [])
        bad = good.replace(b'__HUB_URL__', b'https://hub.example.test')
        self.assertIn('frontend-placeholder', {f['rule'] for f in public.findings_for('crumbs/dist/app.js', bad, [])})
        domain = ('https://crumbs.' + 'kebabstack.com').encode()
        self.assertIn('deployment-domain', {f['rule'] for f in public.findings_for('config.txt', domain, [])})

    def test_literal_unicode_replacement_character_is_valid_source(self):
        source = 'const replacementCharacter = "\ufffd";'.encode('utf-8')
        self.assertEqual(public.findings_for('parser.js', source, []), [])
        self.assertIn('binary-review', {f['rule'] for f in public.findings_for('invalid.bin', b'\xff', [])})

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.base = Path(self.tmp.name)
        self.repo = self.base / 'repo'
        self.repo.mkdir()
        self.git('init', '-q')
        self.git('config', 'user.name', 'Example contributor')
        self.git('config', 'user.email', 'contributor@example.test')
        self.write('README.md', '# Example project\n')
        self.write('LICENSE', 'MIT example license retained exactly\n')

    def tearDown(self):
        self.tmp.cleanup()

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], stderr=subprocess.PIPE)

    def write(self, name, text):
        path = self.repo / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def commit(self):
        self.git('add', '.')
        self.git('commit', '-qm', 'Fixture')

    def test_exports_only_committed_bytes_and_never_history_or_internal_receipts(self):
        self.write('app.txt', 'public version')
        self.write('docs/release-fixture.md', 'private deployment receipt')
        self.write('app/deployments/receipt.md', 'private receipt')
        self.write('.env', 'private environment')
        executable = self.write('tools/run.sh', '#!/bin/sh\nexit 0\n')
        executable.chmod(0o755)
        self.commit()
        old_commit = self.git('rev-parse', 'HEAD').decode().strip()
        self.write('app.txt', 'private working copy')
        self.write('untracked.txt', 'private untracked notes')
        report, files = public.audit(self.repo)
        self.assertFalse(report['findings'])
        out = self.base / 'public'
        public.export_tree(self.repo, out, report, files)
        self.assertEqual((out / 'app.txt').read_text(), 'public version')
        self.assertFalse((out / '.git').exists())
        self.assertFalse((out / '.env').exists())
        self.assertFalse((out / 'docs/release-fixture.md').exists())
        self.assertFalse((out / 'app/deployments').exists())
        self.assertFalse((out / 'untracked.txt').exists())
        self.assertEqual((out / 'LICENSE').read_bytes(), (self.repo / 'LICENSE').read_bytes())
        self.assertTrue((out / 'tools/run.sh').stat().st_mode & 0o111)
        manifest = json.loads((out / '.kebab-public-source.json').read_text())
        self.assertEqual(manifest['sourceCommit'], old_commit)
        self.assertFalse(manifest['marketplaceReady'])

    def test_secret_refuses_export_and_report_does_not_contain_secret(self):
        secret = 'gh' + 'p_' + 'Q' * 36
        self.write('config.js', 'const token = "' + secret + '";')
        self.commit()
        report, files = public.audit(self.repo)
        self.assertEqual(report['findings'][0]['rule'], 'github-token')
        self.assertNotIn(secret, json.dumps(report))
        with self.assertRaises(ValueError):
            public.export_tree(self.repo, self.base / 'public', report, files)
        self.assertFalse((self.base / 'public').exists())

    def test_credential_and_frontend_placeholder_cannot_be_waived(self):
        secret = 'xox' + 'b-' + '9' * 40
        content = 'const key = "' + secret + '"'
        self.write('config.js', content)
        self.write('desk/dist/app.js', 'const BACKEND_CANISTER_ID = "live"; const HUB_URL = "live";')
        self.commit()
        reviews = [{'path': 'config.js', 'sha256': public.digest(content.encode()),
                    'rules': ['slack-token'], 'reason': 'A review must not bypass a credential'}]
        report, _ = public.audit(self.repo, reviews=reviews)
        self.assertEqual({x['rule'] for x in report['findings']}, {'slack-token', 'frontend-placeholder'})

    def test_binary_review_is_bound_to_exact_file_bytes(self):
        p = self.repo / 'image.bin'
        p.write_bytes(b'\x89PNG\0\xff')
        self.commit()
        report, _ = public.audit(self.repo)
        finding = report['findings'][0]
        review = {'path': finding['path'], 'sha256': finding['sha256'],
                  'rules': ['binary-review'], 'reason': 'Reviewed synthetic illustration and its license'}
        approved, _ = public.audit(self.repo, reviews=[review])
        self.assertFalse(approved['findings'])
        p.write_bytes(b'\x89PNG\0\xfe')
        self.commit()
        changed, _ = public.audit(self.repo, reviews=[review])
        self.assertEqual(changed['findings'][0]['rule'], 'binary-review')

    def test_existing_destination_and_source_checkout_are_preserved(self):
        self.commit()
        report, files = public.audit(self.repo)
        destination = self.base / 'keep'
        destination.mkdir()
        (destination / 'precious').write_text('keep')
        for path in [destination, self.repo / 'output']:
            with self.assertRaises(ValueError):
                public.export_tree(self.repo, path, report, files)
        self.assertEqual((destination / 'precious').read_text(), 'keep')
        self.assertFalse((self.repo / 'output').exists())
        alias = self.base / 'source-alias'
        alias.symlink_to(self.repo, target_is_directory=True)
        with self.assertRaises(ValueError):
            public.export_tree(self.repo, alias / 'output', report, files)
        self.assertFalse((self.repo / 'output').exists())

    def test_binary_review_never_waives_embedded_credentials(self):
        secret = ('gh' + 'p_' + 'B' * 36).encode()
        data = b'\xff\0metadata: ' + secret
        (self.repo / 'photo.bin').write_bytes(data)
        self.commit()
        reviews = [{'path': 'photo.bin', 'sha256': public.digest(data),
                    'rules': ['binary-review'], 'reason': 'Reviewed example image content'}]
        report, _ = public.audit(self.repo, reviews=reviews)
        self.assertEqual(report['findings'][0]['rule'], 'github-token')
        self.assertNotIn(secret.decode(), json.dumps(report))

    def test_pem_key_material_and_escaped_material_are_blocked_but_header_parsers_are_not(self):
        header = '-----BEGIN ' + 'PRIVATE KEY-----'
        for separator in ['\n', '\\n', '\r\n', '\\r\\n']:
            data = (header + separator + 'A' * 64).encode()
            self.assertIn('private-key', [f['rule'] for f in public.findings_for('key.txt', data, [])])
        parser = ('const header = "' + header + '";').encode()
        self.assertEqual(public.findings_for('parser.js', parser, []), [])

    def test_symlink_is_not_followed_and_submodule_is_refused(self):
        (self.repo / 'external').symlink_to('/etc/passwd')
        self.commit()
        commit = self.git('rev-parse', 'HEAD').decode().strip()
        self.git('update-index', '--add', '--cacheinfo', '160000,' + commit + ',vendored')
        self.git('commit', '-qm', 'Submodule fixture')
        report, files = public.audit(self.repo)
        self.assertEqual({f['path'] for f in report['findings']}, {'external', 'vendored'})
        self.assertNotIn('external', files)
        self.assertNotIn('vendored', files)

    def test_links_to_excluded_evidence_are_not_silently_broken(self):
        self.write('docs/release-private.md', 'private')
        self.write('docs/guide.md', '[receipt](release-private.md#verification)')
        self.commit()
        report, _ = public.audit(self.repo)
        self.assertEqual(report['findings'][0]['rule'], 'link-to-private-file')

    def test_private_markers_are_not_echoed_and_cannot_be_waived(self):
        marker = 'internal-' + 'customer-identifier'
        text = 'Private customer: ' + marker
        self.write('notes.md', text)
        self.commit()
        reviews = [{'path': 'notes.md', 'sha256': public.digest(text.encode()),
                    'rules': ['denied-marker'], 'reason': 'Must not bypass private marker'}]
        report, _ = public.audit(self.repo, markers=[marker], reviews=reviews)
        self.assertEqual(report['findings'][0]['rule'], 'denied-marker')
        self.assertNotIn(marker, json.dumps(report))

    def test_cli_refuses_to_overwrite_a_report(self):
        self.commit()
        report = self.base / 'report.json'
        report.write_text('keep')
        result = subprocess.run(['python3', str(ROOT / 'tools/public-source.py'), '--repo',
                                 str(self.repo), '--report', str(report)], capture_output=True)
        self.assertEqual(result.returncode, 2)
        self.assertEqual(report.read_text(), 'keep')


if __name__ == '__main__':
    unittest.main()
