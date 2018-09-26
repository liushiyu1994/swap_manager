#!/usr/bin/env python
import argparse
import socket
import sys
import os
import json

os.chdir(sys.path[0])
with open('config/conf.json') as f_in:
    param = json.load(f_in)


def parse_args():
    parser = argparse.ArgumentParser(description='Allocate new swap files (virtual memory)')
    mutual_exclusive_group = parser.add_mutually_exclusive_group()
    mutual_exclusive_group.add_argument(
        '-m', '--malloc', metavar='SIZE', type=int, help='allocate new swap files with size of SIZE megabytes (MB).')
    mutual_exclusive_group.add_argument(
        '-i', '--info', action='store_true', help='list current memory and allocation status.')
    return parser


def send_request(parser, args):
    s = socket.socket()
    s.settimeout(5)
    if args.info:
        message = {'request': 'info'}
    elif args.malloc is not None:
        message = {'request': 'malloc', 'size': args.malloc}
    else:
        parser.print_help()
        sys.exit(0)
    try:
        s.connect((param['host'], param['port']))
        s.send(json.dumps(message).encode())
        r = s.recv(param['socket_max_len'])
    except socket.timeout:
        print("The server does not respond")
    except ConnectionRefusedError:
        print("The server is not running")
    else:
        response_dict = json.loads(r.decode())
        print("State: {}\nMessage: \n{}".format(response_dict['state'], response_dict['message']))


def main():
    parser = parse_args()
    args = parser.parse_args()
    send_request(parser, args)


if __name__ == '__main__':
    main()
