#!/usr/bin/env python3
"""Compile operator-downloaded DB-IP Lite CSV into bounded native lookup chunks.
No visitor data, network calls, credentials or runtime server. See TRAFFIC.md.
"""
import argparse,csv,gzip,hashlib,ipaddress,json,pathlib,sqlite3,tempfile,datetime

def address(text):
    ip=ipaddress.ip_address(text)
    return int(ipaddress.IPv6Address('::ffff:'+str(ip))) if ip.version==4 else int(ip)

def prepare(source,output,kind,published,expires,dataset_id,attribution):
    if kind not in ('geo','network','hosting'):raise ValueError('Invalid dataset kind')
    release=datetime.date.fromisoformat(published);expiry=datetime.date.fromisoformat(expires)
    if not 0<(expiry-release).days<=93:raise ValueError('Validity must be 1–93 days')
    out=pathlib.Path(output);out.mkdir(parents=True,exist_ok=False)
    values=[];indices={};count=0
    # Disk sort avoids holding millions of Python range objects in memory.
    with tempfile.TemporaryDirectory() as tmp:
        db=sqlite3.connect(pathlib.Path(tmp)/'ranges.sqlite')
        db.execute('CREATE TABLE ranges (start BLOB PRIMARY KEY, end BLOB, idx INTEGER)')
        opener=gzip.open if str(source).endswith('.gz') else open
        with opener(source,'rt',encoding='utf-8',newline='') as stream:
            for row in csv.reader(stream):
                if kind=='geo':
                    if len(row)!=8:raise ValueError('Expected DB-IP City Lite eight-column CSV')
                    value=dict(country=row[3],region=row[4],city=row[5],asn='',network='')
                elif kind=='network':
                    if len(row)!=4:raise ValueError('Expected DB-IP ASN Lite four-column CSV')
                    value=dict(country='',region='',city='',asn='AS'+str(int(row[2])),network=row[3])
                else:
                    if len(row)!=3:raise ValueError('Hosting CSV requires start,end,provider; use documented provider ranges only')
                    value=dict(country='',region='',city='',asn='',network=row[2])
                for k,v in value.items():
                    if len(v)>160 or any(ord(c)<32 or ord(c)==127 for c in v):raise ValueError('Metadata exceeds bounds')
                if value['country'] and (len(value['country'])!=2 or not value['country'].isascii() or not value['country'].isupper()):raise ValueError('Invalid country')
                key=tuple(value.items())
                if key not in indices:indices[key]=len(values);values.append(value)
                if ipaddress.ip_address(row[0]).version!=ipaddress.ip_address(row[1]).version:raise ValueError('Mixed address families')
                start,end=address(row[0]),address(row[1])
                if start>end:raise ValueError('Reversed range')
                parts=[(start,end)]
                # IPv4-mapped addresses are resolved using the IPv4 dataset. IPv6
                # catch-all ranges must not overlap those independently listed rows.
                mapped=281470681743360; mapped_end=mapped+2**32-1
                if ':' in row[0] and start<=mapped_end and end>=mapped:
                    parts=[]
                    if start<mapped:parts.append((start,mapped-1))
                    if end>mapped_end:parts.append((mapped_end+1,end))
                for first,last in parts:
                    db.execute('INSERT INTO ranges VALUES (?,?,?)',(first.to_bytes(16,'big'),last.to_bytes(16,'big'),indices[key]));count+=1
                if count%100000==0:db.commit()
                if count>10000000 or len(values)>500000:raise ValueError('Native dataset capacity exceeded')
        db.commit();previous=None;chunk=bytearray();chunks=[];rows=0
        def flush():
            name=f'{len(chunks):05d}.bin';data=bytes(chunk);(out/name).write_bytes(data)
            chunks.append(dict(file=name,sha256=hashlib.sha256(data).hexdigest(),rows=len(data)//36));chunk.clear()
        for start,end,index in db.execute('SELECT start,end,idx FROM ranges ORDER BY start'):
            if previous is not None and start<=previous:raise ValueError('Overlapping ranges')
            previous=end;chunk.extend(start+end+index.to_bytes(4,'big'));rows+=1
            if len(chunk)==36*1024:flush()
        if chunk:flush()
        db.close()
    charge=sum(256+4*sum(map(len,v.values())) for v in values)
    if charge>96000000:raise ValueError("Metadata exceeds native storage budget")
    if not rows:raise ValueError('Empty dataset')
    data=json.dumps(values,ensure_ascii=False,separators=(',',':')).encode();(out/'values.json').write_bytes(data)
    epoch=lambda d:int(datetime.datetime.fromisoformat(d).replace(tzinfo=datetime.timezone.utc).timestamp())
    manifest=dict(id=dataset_id,kind=kind,source=attribution,publishedAt=epoch(published),expiresAt=epoch(expires),rows=rows,values=len(values))
    (out/'manifest.json').write_text(json.dumps(dict(manifest=manifest,valuesSha256=hashlib.sha256(data).hexdigest(),chunks=chunks),indent=2)+'\n')
    return manifest
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['source','output','kind','published','expires','id','attribution']:p.add_argument('--'+name,required=True)
    a=p.parse_args();print(json.dumps(prepare(a.source,a.output,a.kind,a.published,a.expires,a.id,a.attribution)))
