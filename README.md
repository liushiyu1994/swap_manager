# Swap File Manager
A simple swap file manager for Linux

## Introduction
In Linux, virtual memory is achieved by swap partitions and swap files. Swap partitions are more efficient, but swap files is more convenient to use. You can allocate swap files any time you want and remove it after usage to save disk space.

The best way to use the swap file is allocate it when need, and let some system to release it when idle for a enough time, just like garbage collection in Java. This package aims to behave like this.

This project is developed based on Node.js implementation. As a event-driven language, Javascript is exactly suitable for this kind of work. 

## Get started

Installation:

```{shell}
git clone https://github.com/liushiyu1994/swap_manager
``` 

Running the manager script:

```{shell}
sudo node ./daemon_swap_manager.js start
``` 

This code relies on Node.js project. It can be download on [their website][].

For more convenience, just make a link to `new_memory.py`:

```{shell}
sudo ln -s /usr/bin/new_memory /path/to/this/script/new_memory.py
``` 


[their website]: https://nodejs.org/

In Linux you can append this command to `/etc/rc.local` to automatically run it when restart.

## Usage

Check current available memory:

```{shell}
# Any of them is OK.
new_memory -i
new_memory --info
``` 
will display
```{shell}
State: success
Message:
Available total memory:         65927M
Allocated swap files:          299M
Available new swap file:         99700M
``` 
`State` shows return state. If not success, error will display.

`Message` shows information we need. `Available total memory` represents total available memory, including memory on board, swap partition and swap files. `Allocated swap files` shows memory of allocated swap files. `Available new swap file` shows size of new swap files that could be allocated. Maximal amount of swap files can be set in config file (default is 100 GB). 

Use the following command to allocate new swap files:
```{shell}
new_memory -m 100
new_memory --malloc 100
``` 
This command will create a 100 MB swap file. The unit of number is MB. There is a requirement of minimal size of swap file, which can be configured in config file (default is 100 MB).

The return information will be:
```{shell}
State: success
Message:
Allocation of 100M swap file success!
Available total memory:         65433M
Allocated swap files:           100M
Available new swap file:                99900M
``` 
`success` shows succeed to allocate new swap file. The information has the same meaning with `--info` option.

After idle for a while (usage amount is 0), the swap file will be recycled by the manager, and disk space will be released. The idle time can also be set in config file (default is 60 minites)

## Configure file

Configure file of this program is in `./config/conf.json`. 

System configurations:

* `malloc_bash_file_name`: the bash file name to allocate new swap file. No need to change.

* `free_bash_file_name`: the bash file name to release idle swap file. No need to change.

* `data_store_file_name`: file name to store the allocated swap file information. No need to change.

* `swap_file_info`: system file to store the swap information in Linux system. No need to change

* `host`: host ip address to run the manager server. No need to change.

* `port`: port id that the manager server use to communicate. Change it if conflict with other process.

* `socket_max_len`: maximal length of communicating sentences. No need to change.

Custom configurations:

* `swap_root_path`: root path to store the allocated swap files.

* `max_mem`: maximal size of all allocated swap files. Unit is MB.

* `min_new_swap`: minimal size of new swap file. Unit is MB.

* `expire_time`: idle time before release a swap file. Unit is minute.

* `safe_min_mem`: reserved hidden memory when display available memory. It is designed to keep system safe.

Log configurations:

* `log_file_path`: path of log file. Change it when you need.

* `log_level`: level to write log. Current choice are 0 (verbose) and 1 (abstract).
