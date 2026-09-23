import importlib.util, pathlib, subprocess, tempfile, unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('release',ROOT/'tools/check-release.py'); release=importlib.util.module_from_spec(spec);spec.loader.exec_module(release)
class ReleaseChecks(unittest.TestCase):
    def test_live_ids_rejected_without_mapping_files(self):
        for path,fields in release.FRONTENDS.items():
            valid='\n'.join(f'const {k} = "{v}";' for k,v in fields.items())
            self.assertEqual(release.placeholder_errors(path,valid),[])
            first=next(iter(fields));bad=valid.replace(f'const {first} = "{fields[first]}";',f'const {first} = "live-deployment";')
            self.assertTrue(release.placeholder_errors(path,bad))
    def test_duplicate_constant_or_comment_is_not_a_valid_placeholder(self):
        path='desk/dist/app.js'
        self.assertTrue(release.placeholder_errors(path,'// __BACKEND_CANISTER_ID__ __HUB_URL__'))
        valid='const BACKEND_CANISTER_ID = "__BACKEND_CANISTER_ID__"; const HUB_URL = "__HUB_URL__";'
        self.assertTrue(release.placeholder_errors(path,valid+' const HUB_URL = "https://live.test";'))
    def test_customer_entry_point_gets_its_own_backend_binding(self):
        import ast
        source = ast.parse((ROOT/'kitchen/tools/pack-recipes.py').read_text())
        # Load declarations only; do not invoke the packer or its CLI arguments.
        namespace = {'__file__': str(ROOT/'kitchen/tools/pack-recipes.py'), '__name__': 'recipe_test'}
        exec(compile(source, str(ROOT/'kitchen/tools/pack-recipes.py'), 'exec'), namespace)
        recipe = next(r for r in namespace['RECIPES'] if r['id'] == 'desk')
        self.assertIn({'file':'/support.js','from':'__BACKEND_CANISTER_ID__','to':'${backend}'}, recipe['patch'])
        self.assertIn('desk/dist/support.js', release.FRONTENDS)

    def test_packer_rejects_source_destination_without_deleting_it(self):
        marker=ROOT/'package.json';before=marker.read_bytes()
        r=subprocess.run(['python3','kitchen/tools/pack-recipes.py','--out',str(ROOT),'--build'],cwd=ROOT,capture_output=True,text=True)
        self.assertNotEqual(r.returncode,0);self.assertIn('unsafe output',r.stderr);self.assertEqual(marker.read_bytes(),before)
    def test_packer_preserves_previous_output_when_build_not_requested(self):
        with tempfile.TemporaryDirectory() as d:
            out=pathlib.Path(d)/'recipes';out.mkdir();(out/'old').write_text('keep')
            r=subprocess.run(['python3','kitchen/tools/pack-recipes.py','--out',str(out)],cwd=ROOT,capture_output=True)
            self.assertNotEqual(r.returncode,0);self.assertEqual((out/'old').read_text(),'keep')
    def test_existing_game_webp_backgrounds_keep_their_media_type(self):
        namespace={'__file__':str(ROOT/'kitchen/tools/pack-recipes.py'),'__name__':'recipe_test'}
        exec(compile((ROOT/'kitchen/tools/pack-recipes.py').read_text(),namespace['__file__'],'exec'),namespace)
        backgrounds=list((ROOT/'bug/dist/assets/two-d').glob('*.webp'))
        self.assertEqual(len(backgrounds),3)
        for image in backgrounds:
            data=image.read_bytes()
            self.assertEqual(data[:4],b'RIFF');self.assertEqual(data[8:12],b'WEBP')
            self.assertEqual(namespace['TYPES'].get(image.suffix.lower(),'application/octet-stream'),'image/webp')
if __name__=='__main__':unittest.main()
