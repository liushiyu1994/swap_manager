const child_process = require('child_process');
const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const os = require('os');

let param = require(`../config`).param;
param.malloc_bash_file = `${__dirname}/${param.malloc_bash_file_name}`;
param.free_bash_file = `${__dirname}/${param.free_bash_file_name}`;
param.data_store_file = `${__dirname}/../${param.data_store_file_name}`;

function string_output_parser(output_raw_string) {
    let row_list = output_raw_string.trim().split("\n");
    let item_separator = /\t+|\s{2,}/;
    let property_list = row_list[0].split(item_separator);
    let return_object_list = [];
    for (let row_string of row_list.slice(1)) {
        let each_row_list = row_string.split(item_separator);
        if (each_row_list.length !== property_list.length) {
            my_log('string_output_parser', `Unequal parser: ${row_string}`);
            return 1;
        }
        let new_object = {};
        for (let i in property_list) {
            new_object[property_list[i]] = each_row_list[i];
        }
        return_object_list.push(new_object);
    }
    return return_object_list;
}


function my_log(function_name, target_string, log_level=1) {
    let print = console.log;
    let output_str = `${print_current_time()} ${function_name}: ${target_string}`;
    if (log_level >= param.log_level) {
        if (param.hasOwnProperty("log_file_path")) {
            fs.appendFile(param.log_file_path, output_str + "\n", function (err) {
                if (err) throw err;});
        }
        else
            print(output_str);
    }
}

function print_current_time() {
    let d = new Date();
    let year = d.getFullYear(), month = d.getMonth() + 1, day = d.getDate(),
        hour = d.getHours(), minute = d.getMinutes(), second = d.getSeconds();
    return `[${year}-${month}-${day} ${hour}:${minute}:${second}]`;
}



function malloc_swap(response_obj, swap_file_path, size) {
    let new_swap = child_process.spawn('sh', [param.malloc_bash_file, swap_file_path, size]);
    let error = 0, error_string = "";
    new_swap.stdout.on('data', function (data) {
        my_log('malloc_new_swap', data, 0);
    });

    new_swap.stderr.on('data', function (data) {
        if(data)
            error = 1;
        my_log('malloc_new_swap', data);
        error_string = data;
    });

    new_swap.on('close', function(code) {
        if(code === 0)
        {
            my_log('malloc_new_swap', `New swap file ${swap_file_path} with ${size}M created.`);
            response_obj.emit('success');
        }
        else
        {
            my_log('malloc_new_swap', `Unsuccessful exit: ${code}. Message: ${error_string}`);
            response_obj.emit('error', error_string);
        }
    });
}

function free_swap(response_obj, swap_file_path) {
    let new_swap = child_process.spawn('sh', [param.free_bash_file, swap_file_path]);
    let error = 0, error_string = "";
    new_swap.stdout.on('data', function (data) {
        my_log('free_swap', data, 0);
    });

    new_swap.stderr.on('data', function (data) {
        if(data)
            error = 1;
        my_log('free_swap', data);
        error_string = data;
    });

    new_swap.on('close', function(code) {
        if(code === 0)
        {
            my_log('free_swap', `Swap file ${swap_file_path} freed`);
            response_obj.emit('success');
        }
        else
        {
            my_log('free_swap', `Unsuccessful exit: ${code}. Message: ${error_string}`);
            response_obj.emit('error', error_string);
        }
    });
}

class Response extends EventEmitter {
    constructor(sock) {
        super();
        let current_response = this;
        current_response.sock = sock;
        current_response.response_json = {'state': '', 'message': ''};
        current_response.on('complete', function () {
            current_response.sock.write(JSON.stringify(this.response_json));
            current_response.sock.destroy();
        });
    }
}

/* Logic: maintain a dict to manage memories and allocate new memories. Check the idle time of memory. If exceeding a
limit, just release it.
*/
function SwapFile(_file_path, _size, _index, _used_size = 0, _used_time = -1) {
    this.file_path = _file_path;
    this.size = _size;
    this.index = _index;
    this.used_size = _used_size;
    if (_used_time < 0)
        this.used_time = Date.now();
    else
        this.used_time = _used_time;
}

SwapFile.prototype.refresh_used_time = function (used_value) {
    this.used_size = used_value;
    if (used_value !== 0)
        this.used_time = Date.now();
};

function MemoryManager() {
    EventEmitter.call(this);
    let current_manager = this;
    fs.readFile(param.data_store_file, 'UTF8', function (err, data) {
        if (err) {
            current_manager.swap_obj_dict = {};
            current_manager.swap_num = 0;
        }
        else {
            let stored_data = JSON.parse(data);
            current_manager.swap_obj_dict = stored_data.swap_obj_dict;
            my_log('MemoryManager', JSON.stringify(current_manager.swap_obj_dict), 0);
            for (let swap_file_obj of Object.values(stored_data.swap_obj_dict)) {
                my_log('MemoryManager', JSON.stringify(swap_file_obj), 0);
                swap_file_obj.__proto__ = SwapFile.prototype;
            }
            current_manager.swap_num = stored_data.swap_num;
        }
    });
    current_manager.total_main_mem = os.totalmem() / 1024 / 1024;
    current_manager.used_main_mem = 0;
    current_manager.total_swap_partition_mem = 0;
    current_manager.used_swap_partition_mem = 0;
    current_manager.total_swap_file_mem = 0;
    current_manager.used_swap_file_mem = 0;
    current_manager.maximal_swap_file_mem = param.max_mem;
    current_manager.expire_time = param.expire_time * 60 * 1000;
    current_manager.on('refresh', function () { current_manager.refresh_usage() });
    current_manager.on('free_swap_files', function () { current_manager.free_unused_swap_files() });
}

MemoryManager.prototype.__proto__ = EventEmitter.prototype;

// { request: 'malloc', size: 100}
MemoryManager.prototype.distribute_assignment = function(sock) {
    let current_manager = this;
    sock.on('data', function(data) {
        let request_obj = JSON.parse(data);
        let response_obj = new Response(sock);
        if (request_obj.request === 'malloc')
        {
            let required_size = request_obj.size;
            my_log('distribute_assignment', `New malloc ${required_size}M request obtained`);
            current_manager.alloc_new_mem(response_obj, required_size);
        }
        else if (request_obj.request === 'info')
        {
            my_log('distribute_assignment', 'New info request obtained');
            current_manager.get_swap_info(response_obj);
        }
        else
        {
            response_obj.emit('complete');
        }
    });

};

MemoryManager.prototype.refresh_usage = function () {
    let memory_manager = this;
    my_log("refresh_usage", "Refreshing swap file usage...", 0);
    memory_manager.used_main_mem = os.freemem() / 1024 / 1024;
    fs.readFile(param.swap_file_info, 'UTF8', function (err, swap_file_string) {
        if (err)
            my_log("refresh_usage", err);
        else {
            let swap_file_obj_list = string_output_parser(swap_file_string);
            memory_manager.total_swap_file_mem = 0;
            memory_manager.used_swap_file_mem = 0;
            for (let swap_file_obj of swap_file_obj_list) {
                if (swap_file_obj["Type"] === 'partition') {
                    memory_manager.used_swap_partition_mem = parseInt(swap_file_obj["Used"]) / 1024;
                    memory_manager.total_swap_partition_mem = parseInt(swap_file_obj["Size"]) / 1024;
                }
                else {
                    let swap_file_name = swap_file_obj["Filename"], used_value = parseInt(swap_file_obj["Used"]);
                    memory_manager.total_swap_file_mem += parseInt(swap_file_obj["Size"]) / 1024;
                    memory_manager.used_swap_file_mem += used_value / 1024;
                    memory_manager.swap_obj_dict[swap_file_name].refresh_used_time(used_value);
                }
            }
            my_log("refresh_usage", "Swap file usage refreshed", 0);
        }
        memory_manager.emit('free_swap_files');
    });
};

MemoryManager.prototype.free_unused_swap_files = function () {
    my_log("free_unused_swap_files", "Freeing unused swap files", 0);
    let current_mem_obj = this;
    for (let swap_file_obj of Object.values(this.swap_obj_dict)) {
        let current_time = Date.now();
        if (current_time - swap_file_obj.used_time > this.expire_time) {
            let new_response = new EventEmitter();
            new_response.on('success', function () {
                my_log('MemoryManager.free_unused_swap_files',
                    `Successfully free ${swap_file_obj.file_path} with size of ${swap_file_obj.size}`);
                current_mem_obj.success_free(swap_file_obj)
            });
            new_response.on('error', function (data) {
                my_log('MemoryManager.free_unused_swap_files', 'Error appeared')
            });
            free_swap(new_response, swap_file_obj.file_path);
        }
    }

};

MemoryManager.prototype.available_total_mem = function () {
    let total_available_mem = this.total_main_mem + this.total_swap_partition_mem
        + this.total_swap_file_mem - this.used_main_mem - this.used_swap_partition_mem
        - this.used_swap_file_mem - param.safe_min_mem;
    return total_available_mem | 0;
};

MemoryManager.prototype.available_swap_file_allocation = function () {
    let total_available_swap_file = this.maximal_swap_file_mem - this.total_swap_file_mem;
    return total_available_swap_file | 0;
};

MemoryManager.prototype.success_free = function (freed_swap_file_obj) {
    this.swap_num -= 1;
    let freed_file_path = freed_swap_file_obj.file_path;
    delete this.swap_obj_dict[freed_file_path];
    this.total_swap_file_mem -= freed_swap_file_obj.size;
};

MemoryManager.prototype.alloc_new_mem = function (response_obj, required_size) {
    let current_mem_obj = this;
    if (required_size < param.min_new_swap) {
        response_obj.response_json.state = 'invalid_size';
        response_obj.response_json.message =
            `Allocation size is invalid\nMinimal swap file size:\t\t${param.min_new_swap}M`;
        response_obj.emit('complete')
    }
    else if (this.total_swap_file_mem + required_size > this.maximal_swap_file_mem) {
        let available_swap_file_size = this.available_swap_file_allocation();
        response_obj.response_json.state = 'memory_limit_exceeded';
        response_obj.response_json.message =
            `Exceed maximal swap file limit\nAvailable swap file size:\t\t${available_swap_file_size}M`;
        response_obj.emit('complete')
    }
    else {
        let swap_file_index = current_mem_obj.swap_num;
        let new_swap_file_name = `${param.swap_root_path}/swap_${swap_file_index}`;
        let new_response = new EventEmitter();
        new_response.on('success', function () {
            let new_swap_file_obj = new SwapFile(new_swap_file_name, required_size, swap_file_index);
            current_mem_obj.success_alloc(new_swap_file_obj);
            let total_allocated_swap = current_mem_obj.total_swap_file_mem | 0;
            let total_available_mem = current_mem_obj.available_total_mem();
            let available_swap = current_mem_obj.available_swap_file_allocation();
            response_obj.response_json.state = 'success';
            response_obj.response_json.message =
                `Allocation of ${required_size}M swap file success!\n` +
                `Available total memory:\t\t\t${total_available_mem}M\n` +
                `Allocated swap files:\t\t\t${total_allocated_swap}M\n` +
                `Available new swap file:\t\t${available_swap}M`;
            response_obj.emit('complete');
        });
        new_response.on('error', function (error_string) {
            response_obj.response_json.state = 'internal_error';
            response_obj.response_json.message = error_string;
            response_obj.emit('complete');
        });
        malloc_swap(new_response, new_swap_file_name, required_size)
    }
};

MemoryManager.prototype.success_alloc = function (new_swap_file_obj) {
    this.swap_num += 1;
    let new_file_path = new_swap_file_obj.file_path;
    this.swap_obj_dict[new_file_path] = new_swap_file_obj;
    this.total_swap_file_mem += new_swap_file_obj.size;
};

MemoryManager.prototype.get_swap_info = function (response_obj) {
    let available = this.available_swap_file_allocation();
    let total_swap_file_mem = this.total_swap_file_mem | 0;
    response_obj.response_json.state = 'success';
    response_obj.response_json.message =
        `Available total memory:\t\t\t${this.available_total_mem()}M\n` +
        `Allocated swap files:\t\t\t${total_swap_file_mem}M\n` +
        `Available new swap file:\t\t${available}M`;
    response_obj.emit('complete');
};

module.exports = {
    my_log: my_log,
    param: param,
    MemoryManager: MemoryManager
};
