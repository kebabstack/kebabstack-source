import importlib.util,pathlib,tempfile,unittest,csv
ROOT=pathlib.Path(__file__).resolve().parents[1]
def module(name):
    spec=importlib.util.spec_from_file_location(name,ROOT/'crumbs/tools'/f'{name}.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
prepare=module('prepare-traffic');hosting=module('prepare-hosting')
class TrafficPreparation(unittest.TestCase):
    def test_mapped_ipv4_and_ipv6_catchall_do_not_overlap(self):
        with tempfile.TemporaryDirectory() as temp:
            p=pathlib.Path(temp);source=p/'source.csv'
            with source.open('w',newline='') as f:csv.writer(f).writerows([['::','::ffff:ffff:ffff','EU','CH','','Test',0,0],['8.8.8.0','8.8.8.255','NA','US','','Test',0,0]])
            m=prepare.prepare(source,p/'out','geo','2026-10-01','2026-12-01','test','Test')
            self.assertEqual(m['rows'],2)
            data=(p/'out/00000.bin').read_bytes();self.assertLess(int.from_bytes(data[16:32],'big'),int.from_bytes(data[36:52],'big'))
    def test_overlapping_ranges_fail(self):
        with tempfile.TemporaryDirectory() as temp:
            p=pathlib.Path(temp);source=p/'source.csv';source.write_text('1.1.1.0,1.1.1.9,Example\n1.1.1.8,1.1.1.10,Other\n')
            with self.assertRaisesRegex(ValueError,'Overlapping'):prepare.prepare(source,p/'out','hosting','2026-10-01','2026-12-01','test','Test')
    def test_hosting_overlap_preserves_both_providers(self):
        rows=list(hosting.ranges({'prefixes':[{'service':'EC2','ip_prefix':'1.1.1.0/24'},{'service':'AMAZON','ip_prefix':'2.2.2.0/24'}]}, {'prefixes':[{'ipv4Prefix':'1.1.1.0/25'}]}))
        self.assertEqual(rows,[('1.1.1.0','1.1.1.127','AWS EC2 / Google Cloud'),('1.1.1.128','1.1.1.255','AWS EC2')])
