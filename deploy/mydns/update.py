#!/usr/bin/env python3
"""Notify MyDNS from the Raspberry Pi's network; credentials stay in its environment."""
import base64
import os
import sys
import urllib.request


def main():
    member_id = os.environ.get('MYDNS_ID', '')
    password = os.environ.get('MYDNS_PASSWORD', '')
    if not member_id or not password:
        raise RuntimeError('MYDNS_ID and MYDNS_PASSWORD are required')
    family = os.environ.get('MYDNS_FAMILY', 'ipv4')
    if family not in ('ipv4', 'ipv6'):
        raise RuntimeError('MYDNS_FAMILY must be ipv4 or ipv6')
    token = base64.b64encode(f'{member_id}:{password}'.encode()).decode()
    request = urllib.request.Request(f'https://{family}.mydns.jp/login.html', headers={'Authorization': f'Basic {token}', 'User-Agent': 'Stacklane-DDNS/1.0'})
    # The response body can include account information; only print a status.
    with urllib.request.urlopen(request, timeout=20) as response:
        body = response.read(65536).decode('utf-8', errors='replace')
        if response.status != 200 or not ('login status=1' in body.lower() or 'login and ip address notify ok' in body.lower()):
            raise RuntimeError('MyDNS did not confirm the update; check MyDNS LOG INFO')
    print(f'MyDNS {family} update confirmed')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print(f'MyDNS update failed ({type(error).__name__}); check local configuration', file=sys.stderr)
        sys.exit(1)
