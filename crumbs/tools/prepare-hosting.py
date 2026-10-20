#!/usr/bin/env python3
"""Normalize operator-downloaded AWS EC2 and Google Cloud public ranges.
Only provider-published compute ranges; a match does not prove automation.
"""
import argparse,csv,ipaddress,json

def ranges(aws,google):
    events={}
    def add(cidr,label):
        net=ipaddress.ip_network(cidr,strict=True)
        start,end=int(net.network_address),int(net.broadcast_address)
        family=net.version
        for point,delta in [(start,1),(end+1,-1)]:
            events.setdefault((family,point),[]).append((label,delta))
    for key,field in [('prefixes','ip_prefix'),('ipv6_prefixes','ipv6_prefix')]:
        for row in aws.get(key,[]):
            if row.get('service')=='EC2':add(row[field],'AWS EC2')
    for row in google.get('prefixes',[]):
        add(row.get('ipv4Prefix') or row['ipv6Prefix'],'Google Cloud')
    active={};previous=None;family=None
    for (version,point),changes in sorted(events.items()):
        if version!=family:active={};previous=None;family=version
        labels=sorted(k for k,v in active.items() if v)
        if previous is not None and previous<point and labels:
            address=ipaddress.IPv4Address if version==4 else ipaddress.IPv6Address
            yield str(address(previous)),str(address(point-1)),' / '.join(labels)
        for label,delta in changes:active[label]=active.get(label,0)+delta
        previous=point

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ['aws','google','output']:p.add_argument('--'+name,required=True)
    a=p.parse_args()
    with open(a.aws) as f:aws=json.load(f)
    with open(a.google) as f:google=json.load(f)
    rows=list(ranges(aws,google))
    if not rows:raise ValueError('No published compute ranges')
    with open(a.output,'x',newline='') as f:csv.writer(f).writerows(rows)
    print(json.dumps({'ranges':len(rows),'awsSyncToken':aws.get('syncToken'),'googleSyncToken':google.get('syncToken')}))
