const net = require('net');
const fs = require('fs');

const common_functions = require('./common_functions');

let my_log = common_functions.my_log;
let param = common_functions.param;
let MemoryManager = common_functions.MemoryManager;


function Main() {
    let main_obj = this;
    main_obj.restart_time = 0;
    main_obj.memory_manager = new MemoryManager();
    main_obj.connect_server = net.createServer(function (sock) {
        main_obj.memory_manager.distribute_assignment(sock)
    });
}


Main.prototype.update_state = function () {
    my_log("update_state", "Updating state...", 0);
    this.memory_manager.emit('refresh');
};


Main.prototype.start = function () {
    let main_obj = this;
    my_log('main', "Start running ");
    setInterval(function () { main_obj.update_state(); }, 60 * 1000);
    main_obj.connect_server.listen(param.port, param.host);
    main_obj.memory_manager.emit('refresh');
};

Main.prototype.restart = function () {
    let main_obj = this;
    main_obj.restart_time += 1;
    my_log('main', JSON.stringify(main_obj), 0);
    my_log('main', "Restart running");
    main_obj.connect_server.close(function () {
        main_obj.connect_server = net.createServer(function (sock) {
            main_obj.memory_manager.distribute_assignment(sock)});
        main_obj.connect_server.listen(param.port, param.host);
        main_obj.memory_manager.emit('refresh');
    });
};

Main.prototype.before_exit = function () {
    let main_obj = this;
    main_obj.connect_server.close(function () {
        let output_string = JSON.stringify(main_obj.memory_manager);
        my_log('exit', output_string, 0);
        fs.writeFile(param.data_store_file, output_string, 'UTF8', function (err) {
            if (err) {
                my_log('exit', `${err}`);
            }
            process.exit()
        });

    });
};

let main_function = new Main();
main_function.start();
process.on('SIGINT', function () {main_function.before_exit(); });
process.on('SIGTERM', function () {main_function.before_exit(); });
process.on('uncaughtException', function (err) {
    my_log('main', JSON.stringify(err));
    if (main_function.restart_time < 3)
        main_function.restart();
    else
        process.emit('SIGTERM');
});
