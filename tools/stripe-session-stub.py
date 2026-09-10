#!/usr/bin/env python3
"""Offline stand-in for api.stripe.com, so a Checkout Session can be created without Stripe.

`POST /sws/go/checkout/webhook` only records a payment against a checkout request row that
already exists, and that row is written by `POST /sws/go/checkout/sessions` -- which calls
the provider. Without a Stripe test key the flow therefore cannot be started at all, and a
simulated webhook for an invented requestId is accepted with 200 and recorded nowhere.

Point the backend at this stub instead:

    etendo.go.checkout.secret.key=sk_test_offline_stub
    etendo.go.checkout.price.id=price_offline_stub
    etendo.go.checkout.api.base.url=http://localhost:8099

Then `POST /sws/go/checkout/sessions` succeeds, writes a CREATED row, and returns a real
requestId that tools/stripe-webhook-simulate.sh can mark paid.

This is a test double, not a Stripe emulator: it answers one endpoint with a plausible
Checkout Session and does not validate the request. Never point a deployed instance that
real users reach at it.

Usage: tools/stripe-session-stub.py [port]   (default 8099)
"""
import json
import sys
import time
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8099


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        form = self.rfile.read(length).decode('utf-8', 'replace')
        # The form body is the whole contract with the provider, so echo it: a field the
        # backend silently dropped is otherwise invisible until someone reaches Stripe.
        print('POST %s\n  %s' % (self.path, form), flush=True)
        payload = json.dumps({
            'id': 'cs_test_offline_%d' % int(time.time() * 1000),
            'object': 'checkout.session',
            'url': 'http://localhost:3100/fake-hosted-checkout',
        }).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *args):
        pass  # the POST handler already logs what matters


if __name__ == '__main__':
    print('Stripe session stub listening on http://127.0.0.1:%d' % PORT, flush=True)
    HTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
