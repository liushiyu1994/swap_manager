#!/usr/bin/env bash
dd if=/dev/zero of=$1 bs=1M count=$2
chmod 600 $1
mkswap $1
sudo swapon $1