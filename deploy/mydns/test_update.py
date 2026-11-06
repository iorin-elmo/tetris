import importlib.util
import os
import unittest
from unittest.mock import patch
from pathlib import Path

spec = importlib.util.spec_from_file_location('update', Path(__file__).with_name('update.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class Response:
    status = 200

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self, _):
        return b'Login and IP address notify OK'


class MyDNSTest(unittest.TestCase):
    @patch.dict(os.environ, {'MYDNS_ID': 'dummy-id', 'MYDNS_PASSWORD': 'dummy-password', 'MYDNS_FAMILY': 'ipv4'})
    def test_uses_https_and_checks_confirmation_without_a_live_update(self):
        with patch.object(module.urllib.request, 'urlopen', return_value=Response()) as opened:
            with patch('builtins.print') as printed:
                module.main()
            request = opened.call_args.args[0]
            self.assertEqual(request.full_url, 'https://ipv4.mydns.jp/login.html')
            self.assertTrue(request.get_header('Authorization').startswith('Basic '))
            self.assertNotIn('dummy-password', str(printed.call_args))

    @patch.dict(os.environ, {'MYDNS_ID': '', 'MYDNS_PASSWORD': ''})
    def test_missing_credentials_do_not_make_a_request(self):
        with patch.object(module.urllib.request, 'urlopen') as opened:
            with self.assertRaises(RuntimeError):
                module.main()
            opened.assert_not_called()


if __name__ == '__main__':
    unittest.main()
